# Minecraft tablet: design

How the tablet's screens look and why. Code: `client/ui/` (`TabletScreen`, `Theme`, `VanillaGui`, `TranscriptView`,
`FlatButton`, `FlatCycle`) and `client/screen/`.

## Look: an in-game window, Agent Office's content

The user's call, after two rounds: the tablet looks like any other Minecraft window, not a device.

- The world is dimmed behind it (not blurred). The window is vanilla's grey panel (`textures/gui/demo_background.png`
  as a nine-slice), text on it in the container-title grey without shadow.
- Project tabs are vanilla's advancement tabs on the panel's top edge.
- Content sits in dark **wells**, sunken and bevelled like a slot: the roster on the left, the chat on the right.
  Other tablet screens get one well over their content.
- Widgets are vanilla's: buttons, cycle pickers, the `MultiLineEditBox` composer, selection lists, scrollers.
- Colours are `Theme`: Agent Office's hues on VS Code Dark Modern greys, code in Dark+ colours, text never pure white
  (except on hover).
- The only own sprites are the four status dots (`tools/gui-sprites.mjs`): idle, working (two frames, swapped every
  400 ms), needs attention.

## Size

The tablet keeps its own GUI scale, like a device has its own DPI: the player's scale, lowered until the screen is at
least 640×360 GUI units. Whole numbers only, so the pixel font stays crisp. Only the vanilla bitmap font is used.

## Chat

- **Header**, on the window like a container title: status dot, agent name, session, status word (the project is the
  selected tab). On the right: the model and effort pickers ("Model: opus"), New, and Dismiss when a body is placed.
  Short of room, the pickers drop their "Model:" / "Effort:" labels, then hide; the title drops the status word, then
  the session, then cuts the name. New and Dismiss always stay.
- **Composer**: one line that grows with the text. Send beside it; while a run works, Stop and Queue side by side.
  Pasted images wait above it as chips until sent.
- **Transcript** (`TranscriptView`) renders what the web chat renders: You cards, the agent's markdown (headings,
  lists, code blocks, tables, links), tool rows (long runs collapse behind "N tool calls"), the done divider (time ·
  tokens · cost), errors, rate limits, sub-agents and images.
  - Inline code keeps the body font and gets a box behind it.
  - Table columns are never narrower than their longest word (capped, so a path can't eat the table).
- **Plates** above the composer: Retry / Resume / Skip when the last turn needs attention; Allow / Deny for each
  waiting permission request.
- **Empty states**: an empty chat shows the agent's name, "No messages yet" and the Enter / Shift+Enter hint; a project
  tab with no chat open says to pick a session on the left or add an agent with Manage agents.

## Checking a change

Screenshot it with a scripted check (`minecraft-mod.md`, Dev loop): at 640×360 and around 1000×562 GUI units, with a
long agent name (`frontend-craftsman`), a table holding a long word, a running session (Stop / Queue) and a waiting
permission request.
