# WAAAH Doctor - Implementation Tasks

## Phase 1: Core Foundation & Loop
- [ ] **TASK-DOC-01: Create Doctor Workflow & Startup Logic**
    - **Context:** `spec.md` Section 3.1
    - **Instructions:**
        - Create `.agent/workflows/waaah-doctor.md`.
        - Implement initialization: Read `state.json` (or default to current HEAD), scan repo structure.
        - Implement the `while(true)` loop using `wait_for_prompt(timeout=60)` to sleep efficiently without burning tokens.
        - On wakeup (timeout or task), check git state.

- [ ] **TASK-DOC-02: Implement Git Polling & State Management**
    - **Context:** `spec.md` US-2
    - **Instructions:**
        - Implement `check_changes` function keying off `git diff --name-only`.
        - Add logic to read/write `.waaah/doctor/state.json`.
        - Ensure it ignores `pnpm-lock.yaml`, `node_modules`, `dist`.

## Phase 2: Analysis Logic
- [ ] **TASK-DOC-03: Implement "Test Coverage" Analyzer**
    - **Context:** `spec.md` FR-2.3
    - **Instructions:**
        - When `.ts` files change, run `pnpm test <file> --coverage`.
        - If coverage < 90%, flag as violation.
    - **Output:** Analyzer returning pass/fail + coverage %.

- [ ] **TASK-DOC-04: Implement "Structure/Quality" Analyzer**
    - **Context:** `spec.md` FR-2.1
    - **Instructions:**
        - Use existing tools (or `view_file_outline`) to check complexity.
        - Basic check: "File > 500 lines" or "Function > 50 lines".
        - Advanced check: "Similar function names" (Token-based similarity).

## Phase 3: Action & Integration
- [ ] **TASK-DOC-05: Implement Task Assignment Logic**
    - **Context:** `spec.md` FR-3.1
    - **Instructions:**
        - Create helper to call `assign_task`.
        - Logic: "If Test Fail -> Assign to Role 'Test Engineer'".
        - Logic: "If Complexity High -> Assign to Role 'Code Monk'".

- [ ] **TASK-DOC-06: CLI Wrapper "Resume Loop" Support**
    - **Context:** `spec.md` US-5
    - **Instructions:**
        - Modify `packages/cli-wrapper` to support a `restart_on_exit` flag or specific exit code.
        - Ensure the Doctor workflow exits cleanly after N iterations to trigger this restart.

## Phase 4: Reporting
- [ ] **TASK-DOC-07: Implement Health Report Generator**
    - **Context:** `spec.md` FR-4.1
    - **Instructions:**
        - Create Markdown generator for `.waaah/health/latest.md`.
        - Section: "Recent Changes", "Issues Found", "Tasks Created".
