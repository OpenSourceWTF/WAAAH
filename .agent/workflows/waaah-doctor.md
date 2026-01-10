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

36: 1. **Sleep / Poll**
37:    - Call `wait_for_prompt({ agentId: "waaah-doctor", timeout: 60 })`.
38:    - **On TIMEOUT** (Normal Daemon Wakeup): Proceed to Step 2.
39:    - **On TASK/PROMPT**: Handle if urgent, otherwise queue and Proceed to Step 2.
40: 
41: 2. **Poll for Changes**
42:    - Run `git fetch origin main`
43:    - Run `git log -1 --format=%H origin/main` to capture `LATEST_SHA`.
44:    - Read `LAST_SHA` from state:
45:      ```bash
46:      LAST_SHA=$(cat .waaah/doctor/state.json | grep -o '"last_sha": *"[^"]*"' | cut -d'"' -f4)
47:      if [ -z "$LAST_SHA" ]; then LAST_SHA=$LATEST_SHA; fi
48:      ```
49:    - IF `"$LATEST_SHA" == "$LAST_SHA"`:
50:      - `update_progress({ message: "No new commits. Sleeping.", phase: "IDLE" })`
51:      - Loop back to Step 1.
52: 
53: 3. **Repo Scan (Changes Detected)**
54:    - Filter for source code changes (ts, tsx, rs) excluding tests/nodes_modules:
55:      ```bash
56:      CHANGES=$(git diff --name-only $LAST_SHA $LATEST_SHA | grep -E "\.(ts|tsx|rs)$" | grep -vE "(\.test\.ts|node_modules|dist)")
57:      ```
58:    - IF `[ -z "$CHANGES" ]`:
59:      - `update_progress({ message: "Only non-source changes detected. Skipping analysis.", phase: "IDLE" })`
60:      - Proceed to Step 4.
61:    - ELSE:
62:      - `update_progress({ message: "Detected source changes. Analyzing...", phase: "ANALYSIS" })`
63:      - Run `find packages -maxdepth 2` to refresh structure map.
64:      - (Next Phase: Execute Analysis Tools on $CHANGES)
65: 
66: 4. **Update State**
67:    - Persist new state:
68:      ```bash
69:      NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
70:      echo "{\"last_sha\": \"$LATEST_SHA\", \"last_run\": \"$NOW\"}" > .waaah/doctor/state.json
71:      ```
72: 
73: 5. **Loop**
74:    - Return to Step 1.
