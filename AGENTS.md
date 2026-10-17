# SofaStream working instructions

SofaStream synchronizes external video players and connects up to four room participants.
The Git repository is this directory (with `SofaStream.sln`), not its parent folder.

## Find the relevant context

- `docs/architecture.md`: ownership of state, layers, HTTP and SignalR contracts.
- `docs/harness.md`: environment, commands, reports and test boundaries.
- `docs/workflow.md`: task acceptance, verification selection and handoff.
- `docs/backlog.json`: identified defects and their desired behavior; open items are not implemented guarantees.

Read the documents relevant to the task. Keep these instructions short; put detailed decisions in `docs/`.

## Working loop

- Use a task branch. Preserve pre-existing user changes. Update remote refs before creating a branch when network access is available.
- Define observable acceptance criteria before changing playback, membership or connection lifecycle.
- For runtime changes use `.agents/skills/sofastream-change/SKILL.md`; for verification use `.agents/skills/sofastream-verify/SKILL.md`.
- Keep Domain independent of ASP.NET, EF Core and browser concerns. API handles transport; Application handles use cases; Infrastructure persists and reads.
- Keep controller/Hub DTOs and browser handlers consistent. Runtime events and initial-state recovery are separate paths and both need attention.
- Introduce a regression test for a bug when it verifies user-visible behavior. A test should expose the old bug before the fix.
- Choose checks from `docs/workflow.md`. Do not run Docker/browser tests for prose-only changes.
- Report behavior changed, checks actually run, their evidence paths, and remaining limitations. A process starting or an HTTP 200 alone does not verify synchronization.
- Prepare a reviewable diff. Commit, push, merge and production deployment require user authorization; existing authorization for the same action remains valid.

## Commands

Run from the repository root:

```sh
npm ci
npm run doctor
npm run dev
npm run check
npm run check:full
npm run diagnose
```

`check` does not require Docker. `check:full` requires Docker and installed Chromium.
Full browser checks start their own local stack with temporary ports and database volumes.
Do not point test commands at sofastream.ru or an existing production database.

## Evidence and dependency changes

- Read failed logs and assertions before retrying. Change a failing assumption or implementation before broadening verification.
- Harness reports are in `artifacts/harness/`; the latest summary is `artifacts/harness/latest.json`.
- Playwright traces and browser console attachments are linked from `artifacts/playwright-report/`.
- Dependencies are pinned in `package-lock.json` and `packages.lock.json`. If intentionally changing a .NET dependency, regenerate locks with `dotnet restore SofaStream.sln --force-evaluate`, then run the relevant checks.
- The local Compose file is `compose.dev.yml`. It uses its own database credentials and project name; production `.env` and User Secrets are not needed.
