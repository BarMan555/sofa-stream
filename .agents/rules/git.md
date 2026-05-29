## Git Branching, Update, and Commit Policy

You are strictly FORBIDDEN from making changes directly to the `main` or `master` branches. All work must be performed in dedicated branches, follow strict naming conventions, and require explicit user approval before committing.

### 1. Repository Synchronization (Mandatory First Step)
Before doing ANY work, modifying files, or creating a new branch, you must ensure your local repository is up to date:
* Run `git fetch --all` to get the latest state from the remote repository.
* Ensure you base your new branch off the latest tracking remote branch.

### 2. Branch Naming Rules
Determine the task type and switch to/create a new branch using the following prefix conventions:
* `feature/[task-name]` — for new features, modules, or business logic.
* `fix/[task-name]` — for bug fixes, errors, and issue resolution.
* `refactor/[task-name]` — for code restructuring, optimization, and cleanup without changing behavior.
* `style/[task-name]` — for UI changes, CSS, HTML layouts, and purely visual redesigns.

### 3. Commit Message Standards (Conventional Commits)
All commit messages must strictly follow the Conventional Commits specification. Use lowercase for the type. Structure: `<type>: <description>`
* `feat: ...` — for new features (corresponds to `feature/` branch).
* `fix: ...` — for bug fixes (corresponds to `fix/` branch).
* `refactor: ...` — for code restructuring (corresponds to `refactor/` branch).
* `style: ...` — for UI, CSS, and formatting changes (corresponds to `style/` branch).
* *Example:* `feat: add user registration validation logic`

### 4. Workflow for Long-Term Tasks and Multi-Commit Features
For complex features that require multiple steps and multiple commits, use the same dedicated branch throughout the entire lifecycle of the task. Do NOT create new branches for sub-tasks.

1. **Initial Setup:**
    * Run `git fetch --all`.
    * Check if a branch for this task already exists (locally or on remote).
    * If it exists, switch to it and run `git pull`. If it does not exist, create it from the latest `main`.

2. **Iterative Development Cycle (Repeat for each sub-task):**
    * Make incremental changes to the code.
    * Present the changes of the current iteration to the user and ask for review.
    * Wait for the exact word **"approve"**.
    * After approval, create a commit in the current branch using Conventional Commits (e.g., `feat: implement data layer for user auth`).

3. **Feature Completion and Merging:**
    * Continue the cycle until the entire feature is fully implemented and tested.
    * Once the comprehensive task is done, explicitly ask the user for final permission to merge into the main branch.
    * **ONLY after explicit final confirmation**, switch to `main`, run `git pull`, merge your feature branch (`git merge feature/[task-name]`), and push the changes.
