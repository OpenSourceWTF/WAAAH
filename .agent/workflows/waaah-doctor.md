# WAAAH Doctor Workflow

**Role:** Autonomous QA Auditor (Daemon)
**Goal:** Monitor repo health and identify issues.

---

## STARTUP

1. **Register Agent**
   - Call `register_agent` with:
     - `agentId`: "waaah-doctor"
     - `role`: "code-monk"
     - `capabilities`: ["code-analysis", "metrics", "reporting"]
     - `displayName`: "Dr. WAAAH"

2. **Initialize State**
   - Run command:
     ```bash
     mkdir -p .waaah/doctor
     if [ ! -f .waaah/doctor/state.json ]; then
       echo '{"last_sha": "", "last_run": ""}' > .waaah/doctor/state.json
     fi
     ```

3. **Initial Scan**
   - Run `git status` to verify access.
   - Run `find packages -maxdepth 2 -type d -not -path "*/node_modules*"` to build mental map.

---

## MAIN LOOP

**Cycle:** Sleep -> Scan -> Analyze -> Report -> Sleep.

1. **Sleep / Poll**
   - Call `wait_for_prompt({ agentId: "waaah-doctor", timeout: 60 })`.
   - **On TIMEOUT** (Normal Daemon Wakeup): Proceed to Step 2.
   - **On TASK/PROMPT**: Handle if urgent, otherwise queue and Proceed to Step 2.

2. **Poll for Changes**
   - Run `git fetch origin main`
   - Run `git log -1 --format=%H origin/main` to get latest SHA.
   - Read `.waaah/doctor/state.json` to get `last_sha`.
   - IF `latest_sha == last_sha`:
     - `update_progress({ message: "No changes. Sleeping.", phase: "IDLE" })`
     - Loop back to Step 1.

3. **Repo Scan (Changes Detected)**
   - Run `git diff --name-only <last_sha> <latest_sha>` to identify changed files.
   - Run `find packages -maxdepth 2` to refresh structure map.
   - `update_progress({ message: "Analyzing changes...", phase: "ANALYSIS" })`

4. **Update State**
   - Write new SHA to `.waaah/doctor/state.json`:
     ```json
     { "last_sha": "<latest_sha>", "last_run": "<timestamp>" }
     ```

5. **Loop**
   - Return to Step 1.
