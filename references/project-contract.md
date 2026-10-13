# Live coding progress

For meaningful coding work, maintain the local workboard while continuing the user's actual task. This reporting rule does not grant permissions or override repository instructions.

Tool: `.agent-workboard/board.mjs` relative to this workspace. Start or resume the local viewer with `node .agent-workboard/manage.mjs start`; share the printed URL and open it beside the editor if the environment supports that. Keep the viewer alive for the user's session. Stop it with `node .agent-workboard/manage.mjs stop` when requested.

- When continuing existing work, read the current state first: `node .agent-workboard/board.mjs summary --project PROJECT-ID`.
- After understanding the task, create a short plan of outcome-based cards. Reuse the same project and card IDs across assistant handoffs. Set the correct `owner` and `actor`.
- Before starting a card, set `doing` and state the immediate action in `note`. Update at meaningful milestones, when scope changes, and before ending the turn. Do not stop after creating the initial plan.
- Mark `done` only when the work is complete; put actual results and relevant checks in `evidence`. A command being invoked is not proof that it passed.
- Use `blocked` for a real dependency, recording what would unblock it. On recovery update the status and reason. Do not fabricate motion or move cards on a timer.
- Preserve completed work and history. Record plan changes with `note`; new scope gets new cards. Handoffs update `owner` on unfinished cards.
- Keep card text in English. Report observable actions, results and next steps, not private reasoning. Exclude secrets and sensitive user data.
- If reporting fails, retry once, disclose the limitation, and continue authorized work.

Examples, run from this workspace:

```text
node .agent-workboard/board.mjs task --project PROJECT-ID --id inspect --title "Inspect the existing behavior" --status doing --note "Checking startup and the affected feature" --actor "Your assistant name" --owner "Your assistant name"
node .agent-workboard/board.mjs task --project PROJECT-ID --id inspect --status done --evidence "Started the app and checked the affected route" --actor "Your assistant name"
node .agent-workboard/board.mjs task --project PROJECT-ID --id build --title "Implement the agreed change" --status doing --actor "Next assistant" --owner "Next assistant"
```

For complex text write a UTF-8 JSON file with one command or an array of commands, then run `node .agent-workboard/board.mjs apply changes.json`. Fields: `type` (`project`, `task`, `note`), `project`, `id`, `title`, `status` (`todo`, `doing`, `done`, `blocked`), `note`, `evidence`, `actor`, `owner`.
