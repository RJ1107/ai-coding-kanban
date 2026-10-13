---
name: live-coding-kanban
description: Show and maintain a real-time English Kanban beside a coding agent, with persistent tasks, evidence and cross-agent handoffs. Use when the user wants visible progress during implementation.
---

# Live Coding Kanban

Turn the user's actual coding task into a live, reviewable board. Continue doing the coding while reporting meaningful changes; creating a static plan alone does not complete this skill.

## Start in the user's project

1. Understand the goal and inspect existing repository instructions. Use the user's project directory, not the installed skill directory, for state. Confirm Node.js 22+ is available; use the environment's existing runtime when `node` is not on PATH.
2. From this skill folder run the portable setup helper, substituting the real paths and a stable task ID:

```text
node scripts/setup.mjs --workspace "/path/to/project" --project "task-id" --title "The user's task" --goal "The expected result" --owner "Codex"
```

Setup copies a dependency-free runtime into `.agent-workboard/`, preserves existing board data, adds scoped progress instructions to `AGENTS.md`, `CLAUDE.md` and `WORKBOARD.md`, and starts a loopback viewer. It preserves existing instructions and backs up modified files. Use `--no-connect` if the user wants a one-session board without project instruction changes. Choose the actual assistant name, not always Codex. Read the returned `boardTool` and `url`; the port may change if another project is already using it.

3. Open the returned URL in a side browser panel when available, otherwise give the user a clickable local link. Use an available preview or forwarding mechanism for a remote executor; do not imply its loopback address opens on the user's device. If preview is unavailable, explain that limitation and keep task state updated.
4. Create a short, useful plan, normally 3–8 cards, using the reporting command below. Choose stable IDs and English titles that describe outcomes. Reuse an existing task project on continuation or handoff.

## Update during real work

Run commands from the user's project directory:

```text
node .agent-workboard/board.mjs task --project task-id --id inspect --title "Check the current behavior" --status doing --note "Starting the app and checking the affected flow" --actor Codex --owner Codex
node .agent-workboard/board.mjs task --project task-id --id inspect --status done --evidence "Started the app; verified the current save flow in the browser" --actor Codex
```

Use `doing` before beginning work, update `note` at meaningful milestones, and use `done` only after completion with actual results or checks in `evidence`. Use `blocked` with a concrete reason and recovery condition. Update the board before the final response. Keep working on the user's task; progress reporting should not add approval gates or become the task itself.

For multiline text or batches, write a UTF-8 JSON file and use `node .agent-workboard/board.mjs apply changes.json`. Read [the command reference](references/commands.md) for schemas and examples.

## Handoffs and limits

- The next coding agent reads this file or the installed project instructions, reuses the same project/card IDs, and updates `owner` on unfinished work. See [the project contract](references/project-contract.md). No shared model API or vendor SDK is needed.
- This works with agents that can read files and run local commands. Native skill discovery is optional; a user can explicitly ask any such agent to read `SKILL.md`. Agents without file/shell access cannot maintain this runtime.
- Status is reported by the assistant, not inferred from private reasoning or guaranteed by an official vendor event stream. Never claim a new agent has been tested unless it actually ran the workflow. Connection status describes the board service, not whether a model is generating.
- Do not invent progress, tests, time savings or completion percentages. Keep state and evidence free of credentials and private transcripts. Use fictional data for public showcases and label it.
- Keep the UI and cards in English. The board supports manual changes, conflict detection, evidence, history and a narrow side-panel view.

Leave the viewer running when handing it to the user. On request, stop only this project's owned server with `node .agent-workboard/manage.mjs stop`; saved tasks remain.
