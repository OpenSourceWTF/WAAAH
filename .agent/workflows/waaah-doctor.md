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
   - Run `git log -1 --format=%H origin/main` to capture `LATEST_SHA`.
   - Read `LAST_SHA` from state:
     ```bash
     LAST_SHA=$(cat .waaah/doctor/state.json | grep -o '"last_sha": *"[^"]*"' | cut -d'"' -f4)
     if [ -z "$LAST_SHA" ]; then LAST_SHA=$LATEST_SHA; fi
     ```
   - IF `"$LATEST_SHA" == "$LAST_SHA"`:
     - `update_progress({ message: "No new commits. Sleeping.", phase: "IDLE" })`
     - Loop back to Step 1.

3. **Repo Scan (Changes Detected)**
   - Filter for source code changes (ts, tsx, rs) excluding tests/node_modules:
     ```bash
     CHANGES=$(git diff --name-only $LAST_SHA $LATEST_SHA | grep -E "\.(ts|tsx|rs)$" | grep -vE "(\.test\.ts|node_modules|dist)")
     ```
   - IF `[ -z "$CHANGES" ]`:
     - `update_progress({ message: "Only non-source changes detected. Skipping analysis.", phase: "IDLE" })`
     - Proceed to Step 5.
   - ELSE:
     - `update_progress({ message: "Detected source changes. Analyzing...", phase: "ANALYSIS" })`
     - Run `find packages -maxdepth 2` to refresh structure map.
     - Proceed to Step 4.

4. **Test Coverage Analysis**
   - For each changed file in `$CHANGES`:
     ```bash
     # Find the package containing this file
     PKG=$(echo "$FILE" | cut -d'/' -f1-2)
     
     # Run coverage for the specific package
     COVERAGE_OUTPUT=$(pnpm --filter "./$PKG" test --coverage --reporter=json 2>&1 || true)
     
     # Parse coverage percentage (vitest JSON format)
     TOTAL_COV=$(echo "$COVERAGE_OUTPUT" | grep -o '"pct":[0-9.]*' | head -1 | cut -d':' -f2)
     ```
   - IF `TOTAL_COV` < 90:
     - Record violation:
       ```json
       {
         "type": "coverage",
         "file": "<file_path>",
         "package": "<package_name>",
         "coverage": <coverage_pct>,
         "threshold": 90,
         "message": "Coverage below 90% threshold"
       }
       ```
     - `update_progress({ message: "Coverage violation: <file> at <coverage>%", phase: "ANALYSIS" })`
   - ELSE:
     - `update_progress({ message: "Coverage OK for <file>", phase: "ANALYSIS" })`

5. **Update State**
   - Persist new state:
     ```bash
     NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
     echo "{\"last_sha\": \"$LATEST_SHA\", \"last_run\": \"$NOW\"}" > .waaah/doctor/state.json
     ```

6. **Loop**
   - Return to Step 1.
