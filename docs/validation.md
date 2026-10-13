# Validation

Version 2.0.0 was validated on Windows 11 with Node.js 24 and Chromium 153 on 13 October 2026. The runtime targets Node.js 22+ and uses platform-neutral Node APIs; macOS and Linux have not been executed.

## Automated runtime checks

`node --test scripts/check.mjs` passes six groups:

- Task lifecycle, owner handoffs, project isolation, retained evidence, no-op updates and stale-edit protection.
- Time in status survives edits and resets on a status change, boards written by 1.x gain it on their next update, and the handoff summary lists blockers before finished work with owners and evidence.
- Twelve concurrent CLI writers without lost tasks or a leftover lock.
- Live events, local mutation checks, the summary endpoint (including an unknown project), all four viewer assets, restart persistence and unavailable private routes.
- Clean-workspace setup, paths containing spaces, preserved repository instructions, repeated setup and project-local state.
- Occupied-port handling, reuse of the owned viewer, replacement of an owned viewer left running by an older runtime version, and stopping that viewer without stopping another listener.

The summary-endpoint check was written for 2.0 and failed on its first run: asking for an unknown project crashed the viewer. The handler was fixed and the suite rerun.

## Browser checks for the 2.0 viewer

Scripted with Playwright driving Chromium against a running board. Ten checks pass:

- No horizontal overflow at 420, 860, 1024, 1360, 1440 and 1920 px wide, at the top of the page and scrolled.
- A title containing literal markup is displayed as text and runs nothing.
- Dragging a card to another column changes its status and records the actor as `You`.
- With a card open and unsaved text typed, an assistant update shows the warning, leaves the typed text alone, and the save is refused; the assistant's version stays stored.
- Title, owner and status can be edited in the drawer.
- Clicking an owner dims every other owner's cards; clicking again clears it.
- Enter on a focused card and a click on a ring arc both open that card.
- Adding a task, creating a second project from the menu and switching back.
- The tab title carries the done count and the blocked warning.
- Under reduced motion the board still updates live, with no flight and no running animations.

The only console message during the run was the expected HTTP 400 for the refused stale save.

Separately, a recording was made while real CLI updates arrived and its frames were reviewed: cards travel from the old column to the new one, the ring count changes, the focus strip swaps, and the activity timeline gains an entry, all without reload. `Copy handoff` put Markdown on the clipboard; the recording script read it back and asserted that it contained the blocked card and its reason.

Firefox and Safari were not run. This script needs Playwright, so it is not part of the dependency-free repository.

## Claude Code

A Claude Code session on Windows read `SKILL.md` and followed it without changes to the skill:

- Setup created the runtime in a clean workspace, wrote `CLAUDE.md`, and chose port 4319 because 4318 was in use by another board.
- The session kept a six-card board for a real task (the 2.0 redesign and its demo media), reporting through `task` and `apply` on standard input. Updates appeared in the app's built-in browser without reload.
- Rerunning setup upgraded that board in place from 1.0.0 to 2.0.0: the cards and history were kept, no instruction backup was created, and only the workspace's own viewer was replaced, on the same port.
- After the computer was shut down mid-task, `manage.mjs start` brought the viewer back with the board intact.

One problem surfaced along the way and is fixed in 2.0: a viewer started by an older runtime kept serving old server code after an upgrade.

Not run: a separate Claude Code process discovering the skill from `.claude/skills/`. The command-line client on the test machine was not signed in, so native discovery by a fresh process remains unverified. Other vendors' agents have not been run.

## Codex

Unchanged from 1.0: Codex maintained its own board while building the first version, and a separate Codex agent received the skill and a clean project, implemented an offline notes page and completed three cards with evidence. Codex has not been rerun against 2.0; the reporting commands it used are unchanged, and `summary` is additive.

## Demo media

The clip and screenshots show a fictional plan (CSV export for a reports page). Every board change in the clip is a real `board.mjs` command run against the live viewer during capture. The MP4 narration is a synthetic system voice; its loudness was measured but nobody has listened to it for pronunciation. The packaged skill contains no personal task database, credentials or private project source.
