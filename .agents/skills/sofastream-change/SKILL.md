---
name: sofastream-change
description: Implement or debug SofaStream playback, room membership, HTTP or SignalR changes using the project's acceptance criteria and verification paths.
---

Read [architecture](../../../docs/architecture.md) and the relevant item in [backlog](../../../docs/backlog.json).
Use [workflow](../../../docs/workflow.md) to select checks and [harness](../../../docs/harness.md) for commands.

For behavior changes, describe the trigger and expected outcome. Trace the affected HTTP command, domain transition, persistence, notification and browser application paths. Include initial state or reconnect recovery when affected.

For a reported defect, reproduce it at the smallest meaningful level. Add a regression test that distinguishes the original behavior from the intended behavior, then make the focused change. Preserve unrelated open defects and user edits.

Keep diagnostics out of the product UI. Use harness logs and test reports for implementation details. Treat external video and WebRTC compatibility separately from controlled-player checks.

Finish with the changed behavior, the checks actually completed, evidence paths and any outstanding acceptance criteria. Update the backlog item only when those criteria are met.
