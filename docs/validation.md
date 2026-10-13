# Validation

Validated on Windows with Node.js 24 and Chromium on 13 October 2026. The runtime targets Node.js 22+ and uses platform-neutral Node APIs; macOS and Linux have not been executed in this validation.

## Automated runtime checks

`node --test scripts/check.mjs` passed five groups:

- Task lifecycle, owner handoffs, project isolation, retained evidence, no-op updates and stale-edit protection.
- Twelve concurrent CLI writers without lost tasks or a leftover lock.
- Live events, local mutation checks, restart persistence and unavailable private routes.
- Clean-workspace setup, paths containing spaces, preserved repository instructions, repeated setup and project-local state.
- Occupied-port handling, reuse of the owned viewer, and stopping that viewer without stopping another listener.

## Browser checks

Real CLI updates appeared without reload. Manual changes, blockers, drag-and-drop, safe rendering of literal markup, stale-edit conflicts, project switching and side-panel preference recovery passed. No horizontal overflow was found at 320, 360, 420, 768, 1024 or 1440px. No browser runtime errors were recorded. Wide and compact screenshots were visually reviewed.

## Independent forward-test

A separate Codex agent received this skill and a clean project, then implemented an offline notes page while maintaining its own live board. It completed three task cards with evidence. Browser checks covered whitespace rejection, multiline notes, persistence after reload, literal markup display, deletion and persisted empty state. Rerunning setup preserved its cards/history and reused the viewer.

The first trial found a misplaced health handler. The source was corrected and the clean setup plus automated checks were rerun successfully. On this host, a sandbox-launched server could not be reached by the normal browser; an authorized normal-host launch resolved the environment restriction. This is an execution-permission boundary, not a reason to disable protections in another environment.

Claude Code project instruction files and the agent-independent CLI are included. An actual Claude Code process and other vendors' agents have not been run here. Compatibility is based on the shared file/shell interface; each agent still needs to read and follow the skill.

Public demo media records the real development board and real updates. The packaged skill contains no personal task database, credentials or private project source.
