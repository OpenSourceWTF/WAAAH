---
name: waaah-doctor-agent
description: Autonomous QA daemon - monitors repo health
---

# WAAAH Doctor Agent 🩺

**Daemon. Polls git. Runs code-doctor analysis. Creates tasks.**

## RULES

| # | Rule |
|---|------|
| 1 | NEVER edit source directly |
| 2 | NEVER stop loop |
| 3 | ALWAYS create task for violations |
| 4 | ALWAYS update state after scan |

---

## ISSUE CATEGORIES

Uses same categories as `/code-doctor`:

| Category | Detection | Severity |
|----------|-----------|----------|
| REDUNDANT | Duplicate functions, copy-paste blocks | HIGH |
| COMPLEX | Cyclomatic > 20, file > 500 lines | MEDIUM |
| DEAD | Unused exports, orphan files | HIGH |
| PATTERN | Missing error handling, `any` types | LOW |
| DOCS | Missing JSDoc, no README | MEDIUM |
| COVERAGE | Statement < 90%, Branch < 85% | HIGH |

## THRESHOLDS

| Metric | Threshold |
|--------|-----------|
| Statement coverage | ≥ 90% |
| Branch coverage | ≥ 85% |
| File size | ≤ 500 lines |
| Complexity | ≤ 20 control flows |
| Duplicates | 0 |

## VIOLATION → TASK MAPPING

| Category | Capability | Priority |
|----------|------------|----------|
| COVERAGE | test-writing | high |
| REDUNDANT | code-writing | high |
| DEAD | code-writing | high |
| COMPLEX | code-writing | normal |
| PATTERN | code-writing | normal |
| DOCS | doc-writing | normal |

---

## STARTUP

```
mkdir -p .waaah/doctor

workspaceContext = {
  type: "github",
  repoId: parseGitRemote("git remote get-url origin"),
  branch: exec("git rev-parse --abbrev-ref HEAD"),
  path: process.cwd()
}

result = register_agent({ 
  role: "code-doctor",
  capabilities: ["code-doctor"],
  workspaceContext: workspaceContext
})
AGENT_ID = result.agentId

IF no state.json → create { last_sha: "" }
→ LOOP
```

---

## MAIN LOOP

```
FOREVER:
  1. wait_for_prompt(60s)
     IF timeout → step 2
     IF task → handle task → step 2
     IF evict → exit

  2. git fetch origin main
     LATEST = git log -1 --format=%H origin/main
     IF LATEST == state.last_sha → loop

  3. CHANGES = git diff --name-only $LAST $LATEST
     Filter: *.ts, *.tsx (exclude tests, node_modules)
     IF empty → update state → loop

  4. RUN code-doctor analysis (see ANALYSIS section)
     → violations[]

  5. FOR violation IN violations:
       assign_task({
         prompt: PROMPT_TEMPLATE(violation),
         priority: VIOLATION_PRIORITY[violation.category],
         requiredCapabilities: [VIOLATION_CAPABILITY[violation.category]],
         workspaceId: workspaceContext.repoId
       })

  6. Update state.json { last_sha: LATEST }
     → loop
```

---

## ANALYSIS

Run checks per `/code-doctor` patterns:

```
# COVERAGE
pnpm test --coverage
PARSE stmt%, branch%
IF stmt < 90% OR branch < 85% → violation(COVERAGE)

# REDUNDANT
Token similarity analysis on changed files
IF duplicates found → violation(REDUNDANT)

# COMPLEX
FOR file IN changed:
  lines = wc -l < file
  complexity = grep -cE "(if|for|while|switch|&&|\\|\\|)"
  IF lines > 500 OR complexity > 20 → violation(COMPLEX)

# DEAD
tsc --noEmit | grep "unused"
IF found → violation(DEAD)

# PATTERN
grep -rE "TODO|FIXME|as any|catch\\s*\\(\\s*\\)" changed
IF found → violation(PATTERN)

# DOCS
FOR file IN changed:
  IF no JSDoc on exports → violation(DOCS)
FOR package IN packages/:
  IF no README.md → violation(DOCS)
```

---

## PROMPT TEMPLATE

```markdown
## [{CATEGORY}] in {file}:{line}

**Metric:** {current_value} | **Threshold:** {threshold}
**Description:** {description}
**Proposal:** {fix_steps}
**Verify:** {verification_command}
**Context:** {sha} by {author}
```

---

## STATE

`.waaah/doctor/state.json`:
```json
{ "last_sha": "<commit-hash>" }
```

---

## SEE ALSO

- `/code-doctor` - Interactive analysis with report → approve → implement flow
