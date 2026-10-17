---
name: sofastream-verify
description: Verify a SofaStream code or environment change with the relevant fast, PostgreSQL, SignalR and browser checks, and report evidence and test boundaries.
---

Select checks using [workflow](../../../docs/workflow.md). Commands and diagnostic artifacts are described in [harness](../../../docs/harness.md).

Run the selected repository commands from the Git root. For full checks, verify Docker and Chromium availability. A missing prerequisite is a failed or blocked check, not a passing or silently skipped test.

Inspect the summary and any failed logs. Browser failures include console attachments, screenshots and traces. Distinguish a harness problem, an application regression and an external-service limitation before retrying.

The controlled browser player verifies room behavior with the real API, SignalR and PostgreSQL. It does not establish actual YouTube/RuTube media compatibility or WebRTC behavior across separate networks. Use the manual scenarios in the runbook when those surfaces change.

Report only checks actually run, their results and evidence paths. Keep known application defects explicit. Do not use an increasing pass count or repeated retries as a substitute for the task's acceptance criteria.
