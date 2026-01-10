---
name: waaah-optimize
description: Optimize any workflow/prompt for LLM clarity, brevity, and reliability
---

# Prompt Optimizer

**Input:** Any workflow, prompt, or instruction set.  
**Output:** Optimized version scoring 10/10 on LLM effectiveness.

---

## QUALITY CRITERIA (All must be 10/10)

| Criterion | Definition |
|-----------|------------|
| **Clarity** | Zero ambiguity. One interpretation only. |
| **Brevity** | Minimum tokens. No redundancy. |
| **Structure** | Scannable. Headers, tables, code blocks. |
| **Actionability** | Every instruction is executable. No vague phrases. |
| **Reliability** | Produces same output given same input. |

---

## PROCESS

```
1. RECEIVE target prompt/workflow

2. ANALYZE weaknesses:
   - Ambiguous phrases ("should", "might", "consider")
   - Redundant sections
   - Missing error handling
   - Unclear state transitions
   - Verbose explanations

3. REFINE (max 5 iterations):
   a. Apply compression: Remove filler words
   b. Apply structure: Convert prose to tables/lists
   c. Apply precision: Replace vague verbs with specific commands
   d. Apply guards: Add explicit failure conditions

4. SCORE (after each refinement):
   Rate each criterion 1-10.
   Record scores in critique template.

5. EXIT CONDITIONS:
   - ALL criteria = 10 → OUTPUT final version
   - 5 iterations reached → OUTPUT best version + remaining issues
   - No improvement in 2 consecutive iterations → OUTPUT + flag plateau
```

---

## COMPRESSION RULES

| Pattern | Replace With |
|---------|--------------|
| "You should consider..." | DO: |
| "It's important to..." | (delete) |
| "Make sure to..." | (delete - implicit) |
| "In order to..." | "To..." |
| Paragraph of explanation | Table or bullet |
| Conditional prose | `IF X → Y` format |

---

## STRUCTURE TEMPLATE

```markdown
# [Name]

**[One-line purpose]**

## RULES
| # | Rule |
|---|------|

## STATES
| Input | Action | Output |

## LOOP
```
[pseudocode]
```

## PHASES
### Phase N: [Name]
[numbered steps only]
```

---

## EXAMPLE TRANSFORMATION

**Before (verbose):**
```
When you receive a task, you should first check if it has any 
dependencies. If it does, you need to wait for those dependencies 
to complete before you can start working on the task. It's 
important to verify that all dependencies have the COMPLETED 
status before proceeding.
```

**After (optimized):**
```
ON task_received:
  IF dependencies exist AND any != COMPLETED → WAIT
  ELSE → proceed
```

---

## SELF-CRITIQUE TEMPLATE

```
## Optimization Score

| Criterion | Score | Issue |
|-----------|-------|-------|
| Clarity | ?/10 | |
| Brevity | ?/10 | |
| Structure | ?/10 | |
| Actionability | ?/10 | |
| Reliability | ?/10 | |

**Total: ?/50**

IF < 50: [specific fix needed]
IF = 50: ✅ APPROVED
```

---

## USAGE

```
/waaah-optimize

Input the workflow/prompt to optimize:
> [paste target]

[Agent analyzes, refines, self-critiques until 10/10]

Output: Optimized version
```
