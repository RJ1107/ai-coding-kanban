# Reporting commands

All commands run from the connected project, with an available Node.js 22+ runtime. A successful write is atomic. Writes work even when the viewer is closed. The viewer reloads new state within about one second.

```text
node .agent-workboard/board.mjs project --project feature-a --title "Improve settings" --goal "Make profile settings easier to review" --actor Codex
node .agent-workboard/board.mjs task --project feature-a --id UI-01 --title "Inspect current settings" --status doing --note "Reviewing current fields and save behavior" --actor Codex
node .agent-workboard/board.mjs task --project feature-a --id UI-01 --status done --evidence "Checked the fields and saved a test profile successfully" --actor Codex
node .agent-workboard/board.mjs task --project feature-a --id UI-02 --title "Implement the agreed UI" --status todo --owner "Claude Code" --actor Codex
node .agent-workboard/board.mjs note --project feature-a --note "UI implementation handed over; acceptance criteria are in the task card." --actor Codex
node .agent-workboard/board.mjs summary --project feature-a
node .agent-workboard/board.mjs show
```

`task` creates a new card or updates only supplied fields on an existing card. IDs are scoped to a project. Statuses are `todo`, `doing`, `done`, `blocked`. `actor` identifies who reported the change; `owner` identifies who is responsible for the card. Manual UI actions record actor `You`.

`summary` prints a Markdown handoff: progress counts, then In progress, Blocked, Up next and Done with each card's owner, latest note and evidence, then recent project notes. Run it first when taking over. Without `--project` it summarizes the first project. `show` prints the raw JSON state. Each card also stores `statusAt`, the time it entered its current status; the viewer uses it for elapsed time.

For safe multiline input, create a UTF-8 JSON file:

```json
[
  {"type":"task","project":"feature-a","id":"UI-02","title":"Implement the agreed UI","status":"doing","note":"Building the profile settings layout","actor":"Claude Code","owner":"Claude Code"},
  {"type":"note","project":"feature-a","note":"The backend contract is unchanged; UI implementation is in progress.","actor":"Claude Code"}
]
```

Then run `node .agent-workboard/board.mjs apply changes.json`, or pipe the same JSON to `node .agent-workboard/board.mjs apply` on standard input. Commands in an array are applied in order; each is an independent atomic update. Use the existing runtime's absolute path if the shell does not expose `node`.

Startup: `node .agent-workboard/manage.mjs start`. It resumes an owned server or chooses a free port without stopping other projects, and replaces an owned server left running by an older version of the runtime. Shutdown: `node .agent-workboard/manage.mjs stop`. Data: `.agent-workboard/data/board.json`. History retains the latest 500 updates.

Do not write directly into the skill's installed assets or share another project's data directory. Each connected workspace gets a separate runtime and state file.
