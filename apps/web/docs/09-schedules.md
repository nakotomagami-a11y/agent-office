# Schedules

Schedules let the app run agents **on its own** — do a task at a set time, or automatically pick a run back up when its rate limit resets. It's the difference between babysitting a rate-limited run at 2am and letting the app resume it for you.

Open it from the sidebar (**Schedules**) or navigate to `/schedules`.

> [!NOTE]
> Jobs fire **while the app is running and the machine is awake**. The scheduler uses in-process timers, so it does not wake a sleeping machine — a job that came due while the app was closed or the laptop was asleep fires on the next tick after you're back (see [Catch-up & overdue jobs](#catch-up--overdue-jobs)).

## Two kinds of job

| Kind | `reason` | Created from | What it does |
|---|---|---|---|
| **Manual task** | `manual` | The **New scheduled task** form on this page | Runs a prompt against an agent once, at the time you pick. |
| **Rate-limit resume** | `rate-limit` | The **"Resume when limit resets"** button on a rate-limit / error card in a chat thread | Re-fires the *exact* interrupted run (same session, via `--resume`) the moment the limit resets. |

Both are the same underlying object: a serialized [summon request](#/reference) plus a fire time. That means a scheduled job can carry everything a normal run can — agent, project, prompt, and the session to resume.

## Creating a manual task

Click **New scheduled task** and fill in:

- **Agent** — who runs it (the picker shows each agent's portrait).
- **Project** *(optional)* — scopes the run to a project's working directory and roster.
- **When** — the fire time. The job fires on the first scheduler tick at or after this moment.
- **Prompt** — what the agent should do.

The task appears immediately under **Upcoming** with a `scheduled` status.

## Rate-limit auto-resume

When a run hits an Anthropic rate/usage limit, the chat thread shows a rate-limit card. Click **Resume when limit resets** and Agent Office schedules a `rate-limit` job for the reset time (parsed from the limit message, e.g. *"resets 10:10pm"*, falling back to the thread's known reset time, then to *now + 5h*). A toast confirms the scheduled time.

Creation is **button-only** — the app never silently schedules work on your behalf.

If the resumed run hits the limit *again*, the job reschedules itself to the new reset time and increments its attempt counter. After **5 attempts** it stops retrying and moves to **Needs attention** (`retry-exceeded`) so you can run it by hand when you're ready.

## The list

Jobs are grouped so the ones that need you rise to the top:

| Group | Contains |
|---|---|
| **Needs attention** | Jobs the app couldn't run automatically — highlighted with an amber accent. |
| **Upcoming** | `scheduled` and currently-`running` jobs, soonest first. |
| **Recent** | `done` and `cancelled` jobs. |

Each row shows the agent portrait, the prompt, the fire time with a live relative countdown (`in 2h` / `14h ago`), a status pill, and — for resume jobs — a `rate-limit resume` tag and retry counter.

### Statuses

| Status | Pill | Meaning |
|---|---|---|
| `pending` | `scheduled` | Waiting for its fire time. |
| `firing` | `running` | The job's run is in flight right now. |
| `done` | `done` | Fired successfully; dismiss to clear it. |
| `cancelled` | `cancelled` | You cancelled it. |
| `needs-attention` | `needs attention` | Needs a decision — see below. |

### Needs-attention reasons

| `attention` | Why | Action offered |
|---|---|---|
| `stale` | More than 12h overdue — the app didn't run it automatically. | **Run anyway** (confirmation modal) |
| `missing-instance` | The target agent or instance no longer exists. | **Reassign** to another agent/instance |
| `retry-exceeded` | Still rate-limited after 5 retries. | **Run now** manually |

Every job (except ones already finished) can also be **cancelled** with the trash button; finished jobs offer **Dismiss**.

## Catch-up & overdue jobs

The scheduler ticks every **30 seconds** while the app is open (first tick a few seconds after boot). On each tick it fires any `pending` job whose time has passed.

- A job that came due while the app was **closed** or the machine **asleep** fires on the next tick once you're back — it is *not* lost.
- If a job is more than **12 hours** overdue, it does **not** auto-fire. Instead it becomes `needs-attention: stale` and waits for you to confirm with **Run anyway** — so the app never surprises you by running very old work.

A concurrency guard prevents a job from firing against an agent instance that is already running.

## API

All actions here are scriptable. See [Reference → Schedules](#/reference) for the full endpoint list. In brief:

```bash
# List all jobs
GET  /api/schedules            # → { jobs: [...] }

# Create a manual task (fireAt is unix ms)
POST /api/schedules            # { fireAt, summonRequest, reason?, label? } → { job }

# Cancel, reassign, or run-now
DELETE /api/schedules/:id                      # cancel
PATCH  /api/schedules/:id  { agentId?, projectId?, instanceId? }   # reassign
POST   /api/schedules/:id/run                  # fire immediately (bypasses the stale cap)
```

Jobs persist in the `scheduled_jobs` table (see [Reference → Database schema](#/reference)), so they survive app restarts.
