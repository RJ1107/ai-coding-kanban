---
name: live-coding-kanban
description: Show and maintain a real-time English Kanban beside a coding agent, with persistent tasks, evidence and cross-agent handoffs. Use when the user wants visible progress during implementation.
---

# Live Coding Kanban

Turn the user's actual coding task into a live, reviewable board. Continue doing the coding while reporting meaningful changes; creating a static plan alone does not complete this skill.

## Start in the user's project

1. Understand the goal and inspect existing repository instructions. Use the user's project directory, not the installed skill directory, for state. Confirm Node.js 22+ is available; use the environment's existing runtime when `node` is not on PATH.
2. From this skill folder run the portable setup helper, substituting the real paths, a stable task ID and your own assistant name:

```text
node scripts/setup.mjs --workspace "/path/to/project" --project "task-id" --title "The user's task" --goal "The expected result" --owner "Your assistant name"
```

Setup copies a dependency-free runtime into `.agent-workboard/`, preserves existing board data, adds scoped progress instructions to `AGENTS.md`, `CLAUDE.md` and `WORKBOARD.md`, and starts a loopback viewer. It preserves existing instructions and backs up modified files. Use `--no-connect` if the user wants a one-session board without project instruction changes. Read the returned `boardTool` and `url`; the port may differ from the default when another program is already using it. Running setup again after the skill is updated upgrades the runtime, keeps the cards and restarts only this workspace's viewer.

3. Open the returned URL where the user can see it: the built-in browser or preview pane of a desktop coding app, an editor's side browser, or a clickable local link in a terminal. Use an available preview or forwarding mechanism for a remote executor; do not imply its loopback address opens on the user's device. If no preview is available, say so and keep the task state updated.
4. Create a short, useful plan, normally 3–8 cards, using the reporting command below. Choose stable IDs and English titles that describe outcomes. On continuation or handoff, read the current state first with `node .agent-workboard/board.mjs summary --project task-id` and reuse the existing project and card IDs.

## Update during real work

Run commands from the user's project directory:

```text
node .agent-workboard/board.mjs task --project task-id --id inspect --title "Check the current behavior" --status doing --note "Starting the app and checking the affected flow" --actor "Your assistant name" --owner "Your assistant name"
node .agent-workboard/board.mjs task --project task-id --id inspect --status done --evidence "Started the app; verified the current save flow in the browser" --actor "Your assistant name"
```

Use `doing` before beginning work, update `note` at meaningful milestones, and use `done` only after completion with actual results or checks in `evidence`. The viewer shows how long each card has been in its current status, so a card left in `doing` after the work stopped is visibly stale. Use `blocked` with a concrete reason and recovery condition. Update the board before the final response. Keep working on the user's task; progress reporting should not add approval gates or become the task itself.

For multiline text or batches, write a UTF-8 JSON file and use `node .agent-workboard/board.mjs apply changes.json`, or pipe the JSON to `apply` on standard input. Read [the command reference](references/commands.md) for schemas and examples.

## Handoffs and limits

- The next coding agent reads this file or the installed project instructions, runs `summary`, reuses the same project and card IDs, and updates `owner` on unfinished work. See [the project contract](references/project-contract.md). No shared model API or vendor SDK is needed.
- This works with agents that can read files and run local commands. Native skill discovery is optional; a user can explicitly ask any such agent to read `SKILL.md`. Agents without file/shell access cannot maintain this runtime.
- Status is reported by the assistant, not inferred from private reasoning or guaranteed by an official vendor event stream. Never claim a new agent has been tested unless it actually ran the workflow. The `LIVE` indicator describes the board service, not whether a model is generating.
- Do not invent progress, tests, time savings or completion percentages. Keep state and evidence free of credentials and private transcripts. Use fictional data for public showcases and label it.
- Keep the UI and cards in English. The viewer supports manual edits, drag and drop, conflict detection, evidence, per-card history, a copyable handoff summary and a one-column layout for narrow side panels.

Leave the viewer running when handing it to the user. After a machine restart, resume it with `node .agent-workboard/manage.mjs start`. On request, stop only this project's owned server with `node .agent-workboard/manage.mjs stop`; saved tasks remain.
