# Schedules

Schedules let the app run agents **on its own** — do a task at a set time, or automatically pick a run back up when its rate limit resets. It's the difference between babysitting a rate-limited run at 2am and letting the app resume it for you.

Open it from the sidebar (**Schedules**) or navigate to `/schedules`.

> [!NOTE]
> Jobs fire **while the app is running and the machine is awake**. The scheduler uses in-process timers, so it does not wake a sleeping machine — a job that came due while the app was closed or the laptop was asleep fires on the next tick after you're back (see [Catch-up & overdue jobs](#catch-up--overdue-jobs)).

## Three kinds of job

| Kind | `reason` | Created from | What it does |
|---|---|---|---|
| **Manual task** | `manual` | The **New order** form on this page, **Repeat: Once** | Runs a prompt against an agent once, at the time you pick. |
| **Recurring order** | `manual` + `repeat` | The **New order** form, **Repeat** set to hourly / daily / weekdays / weekly | Runs the prompt at the time you pick, then again every hour, day, weekday or week. |
| **Rate-limit resume** | `rate-limit` | The **"Resume when limit resets"** button on a rate-limit / error card in a chat thread | Re-fires the *exact* interrupted run (same session, via `--resume`) the moment the limit resets. |

All three are the same underlying object: a serialized [summon request](#/reference) plus a fire time. That means a scheduled job can carry everything a normal run can — agent, project, prompt, and the session to resume.

## Creating a manual task

Click **New order** (top right). A dialog opens with the prompt box focused — type what the agent should do, then set the chips under it:

- **Agent** — who runs it (the chip shows the agent's portrait).
- **Project** *(optional)* — scopes the run to a project's working directory and roster.
- **When** — the fire time, defaulting to the next whole hour. The job fires on the first scheduler tick at or after this moment.
- **Repeat** — **Once** (default), **Every hour**, **Every day**, **Weekdays** (Mon–Fri) or **Every week**.

Click **Schedule** or press **⌘↵** (**Ctrl+Enter** on Windows/Linux); a time that has already passed is refused. **Esc** closes the dialog (or just the open menu or date picker). After scheduling, the list switches to the tab the order lands in. A one-shot task appears under **Upcoming**; a recurring order under **Recurring**.

## Recurring orders

A recurring order is one job that re-arms itself instead of finishing:

- **Slots use the server's local time zone** — the machine the app runs on. A first time that falls in a DST gap (02:30 on the spring-forward day) is stored as the shifted time (03:30) for the whole series.
- **Slots keep their wall-clock time.** A daily 09:00 order stays at 09:00 across a DST change; the series is computed from the first time you picked, so a rate-limit retry that runs late does not shift later runs.
- **After each run** the job goes back to `scheduled` for the next slot after both *now* and the slot just run — **Run now** at 08:00 on a 09:00 daily order runs today's occurrence early and does not run it again at 09:00.
- **A first time already in the past** starts at the next slot.
- **Missed slots are skipped.** If the app was off for more than 12 hours, the missed occurrence is dropped and the next slot is armed. Within 12 hours it catches up once, never in a burst.
- **Rate limits** retry that occurrence like any other job (up to 5 attempts). The next occurrence starts a fresh session.
- **Cancel** (trash button) stops the series.

A recurring job that needs attention (`missing-instance`, `retry-exceeded`, `provider-unavailable`, …) stops until you act on it, like a one-shot: **Reassign** or **Run now**; once that run ends, the series re-arms.

> [!WARNING]
> An Agent Office build older than recurring orders (before DB v29) that shares this database and holds the scheduler lease will mark a finished recurring run `done`, ending the series. Keep every running copy (desktop app, `pnpm dev`) on a build with recurring orders.

## Rate-limit auto-resume

When a run hits an Anthropic rate/usage limit, the chat thread shows a rate-limit card. Click **Resume when limit resets** and Agent Office schedules a `rate-limit` job for the reset time (parsed from the limit message, e.g. *"resets 10:10pm"*, falling back to the thread's known reset time, then to *now + 5h*). A toast confirms the scheduled time.

Creation is **button-only** — the app never silently schedules work on your behalf.

If the resumed run hits the limit *again*, the job reschedules itself to the new reset time and increments its attempt counter. After **5 attempts** it stops retrying and moves to **Needs attention** (`retry-exceeded`) so you can run it by hand when you're ready.

## The list

The line under the page title sums up what's armed: `4 queued · next fires in 1h · 1 watcher armed · 2 repeating`.

The list has three tabs:

| Tab | Contains |
|---|---|
| **Upcoming** | A pinned amber **Needs you** group with every needs-attention job (recurring ones too), then everything `scheduled` or `running`, soonest first — a recurring order shows its next slot here too. |
| **Recurring** | Recurring orders that are armed or running, soonest next slot first. |
| **History** | `done` one-shot jobs, newest first, filed under the day they ran. |

Rows are grouped by day (**Today**, **Tomorrow**, **Yesterday**, a weekday, or a date). Each row shows the fire time, the agent portrait, the prompt, a details line (agent · project · repeat · `resumes on rate-limit reset` · retry counter · `last ran …`) and, on the right, a countdown (`in 2h`), `running`, `needs you` or `done`. Hover a row (or tab into it) for its actions: **Run now** and **Cancel** on scheduled jobs, **Dismiss** on finished ones. A failed action shows a toast. If the list can't load, the page says so with **Try again** instead of showing an empty state.

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
| `stale` | More than 12h overdue — the app didn't run it automatically. Recurring orders skip to the next slot instead. | **Run anyway** (confirmation modal) |
| `missing-instance` | The target agent or instance no longer exists. | **Reassign** to another agent/instance |
| `retry-exceeded` | Still rate-limited after 5 retries. | **Run now** manually |
| `provider-unavailable` | The selected AI provider refused the run. | **Run now** once the provider is fixed |
| `bridge-missing` | The permission bridge isn't installed. | None — reinstall the app, then create the order again |

Every job (except ones already finished) can also be **cancelled** with the trash button; finished jobs offer **Dismiss**.

## Catch-up & overdue jobs

The scheduler ticks every **30 seconds** while the app is open (first tick a few seconds after boot). On each tick it fires any `pending` job whose time has passed.

- A job that came due while the app was **closed** or the machine **asleep** fires on the next tick once you're back — it is *not* lost.
- If a job is more than **12 hours** overdue, it does **not** auto-fire. Instead it becomes `needs-attention: stale` and waits for you to confirm with **Run anyway** — so the app never surprises you by running very old work.

A concurrency guard prevents a job from firing against an agent instance that is already running.

A job is marked `running` just before its run starts. If the app crashes before the run is recorded, after 5 minutes the job goes back to `scheduled` and the rules above apply — it is never shown as `done` without a run. A **Run now** from a needs-attention card that is lost this way fires again on its own.

## API

All actions here are scriptable. See [Reference → Schedules](#/reference) for the full endpoint list. In brief:

```bash
# List all jobs
GET  /api/schedules            # → { jobs: [...] }

# Create a manual task (fireAt is unix ms)
POST /api/schedules            # { fireAt, summonRequest, reason?, label?, repeat? } → { job }
                               # repeat: "hourly" | "daily" | "weekdays" | "weekly"; the job carries repeat: { every, anchorAt }

# Cancel, reassign, or run-now
DELETE /api/schedules/:id                      # cancel
PATCH  /api/schedules/:id  { agentId?, projectId?, instanceId? }   # reassign; 409 schedule_not_reassignable unless scheduled / needs attention
POST   /api/schedules/:id/run                  # fire immediately (bypasses the stale cap); 409 schedule_not_runnable unless scheduled / needs attention
```

Jobs persist in the `scheduled_jobs` table (see [Reference → Database schema](#/reference)), so they survive app restarts.
