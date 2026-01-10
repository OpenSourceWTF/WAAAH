# WAAAH Workflows

Agent workflows that define autonomous behaviors. Invoke via `/slash-command` or reference in prompts.

---

## Available Workflows

| Command | Purpose | Type |
|---------|---------|------|
| `/waaah-optimize` | Refine any prompt for LLM effectiveness | Utility |
| `/waaah-spec` | Interactive spec generation with quality gate | Planning |
| `/waaah-orc-loop` | Orchestrator agent lifecycle (plan/build/verify/merge) | Agent Loop |
| `/waaah-doctor` | Code health auditor (QA) | Agent Loop |

---

## `/waaah-optimize`

**Purpose:** Takes any workflow/prompt and refines it iteratively until it scores 10/10 on LLM effectiveness.

**When to use:**
- Before deploying a new workflow
- When an existing workflow is producing inconsistent results
- To compress verbose instructions

**Quality Criteria:**
| Criterion | Definition |
|-----------|------------|
| Clarity | Zero ambiguity |
| Brevity | Minimum tokens |
| Structure | Scannable (tables, headers) |
| Actionability | Every instruction executable |
| Reliability | Same input → same output |

**Process:**
1. Receive target prompt
2. Analyze weaknesses (ambiguity, redundancy, missing guards)
3. Refine (max 5 iterations)
4. Self-critique until 10/10 or plateau

---

## `/waaah-spec`

**Purpose:** Interactive interview loop to extract high-quality specifications from vague requirements.

**When to use:**
- Starting a new feature
- Clarifying ambiguous requirements
- Generating task breakdowns

**Process:**
1. Interview user with targeted questions
2. Rate spec quality 1-10
3. Refine until 8+/10
4. Generate task list with dependencies
5. Bulk-assign to queue

---

## `/waaah-orc-loop`

**Purpose:** Autonomous agent lifecycle for feature development.

**When to use:**
- Assigned by orchestrator for implementation tasks
- Continuous agent operation

**Phases:**
1. **PLAN:** Generate inline spec with testable criteria
2. **BUILD:** TDD loop in worktree, quality gates (9.5+)
3. **SUBMIT:** Capture diff, send for review
4. **MERGE:** On approval, merge to main

**Key Rules:**
- Never edit main directly
- Always capture diff before submit
- Use `update_progress` for heartbeat
- Block on ambiguity, don't guess

---

## `/waaah-doctor`

**Purpose:** Autonomous QA agent that monitors repo health post-merge.

**When to use:**
- Runs as background daemon
- Triggered after task completion

**Capabilities:**
- Detect code quality issues (complexity, duplication)
- Monitor test coverage (target: 90%+)
- Generate remediation tasks

**Process:**
1. On startup: scan repo structure
2. Loop: poll `git diff` for changes
3. On change: analyze, generate health report
4. If issues: create tasks for specific capabilities

---

## Creating New Workflows

1. Run `/waaah-optimize` on your draft
2. Ensure it includes:
   - `---` frontmatter with `name` and `description`
   - Clear RULES table
   - STATE routing (if agent loop)
   - EXIT conditions
3. Save to `.agent/workflows/<name>.md`
