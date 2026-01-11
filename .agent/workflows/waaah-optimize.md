---
name: waaah-optimize
description: Optimize any workflow/prompt for LLM clarity and brevity
---

# Prompt Optimizer

**Input:** Any workflow/prompt. **Output:** 10/10 LLM-optimized version.

## CRITERIA (All must be 10/10)

| Criterion | Definition |
|-----------|------------|
| Clarity | Zero ambiguity |
| Brevity | Minimum tokens |
| Structure | Scannable tables/code |
| Actionability | Every instruction executable |
| Reliability | Same output given same input |

## PROCESS

```
1. RECEIVE target
2. ANALYZE: ambiguous phrases, redundancy, missing guards, verbose prose
3. REFINE (max 5 iter):
   - Compress: remove filler
   - Structure: prose → tables
   - Precision: vague → specific
   - Guards: add failure conditions
4. SCORE each criterion 1-10
5. EXIT: all=10 → output | 5 iter → output best + issues
```

## COMPRESSION

| Pattern | Replace |
|---------|---------|
| "You should consider..." | DO: |
| "It's important to..." | (delete) |
| "Make sure to..." | (delete) |
| "In order to..." | "To..." |
| Paragraph | Table/bullet |
| Conditional prose | `IF X → Y` |

## STRUCTURE TEMPLATE

```markdown
# [Name]
**[One-line purpose]**

## RULES
| # | Rule |

## LOOP
```
[pseudocode]
```

## PHASES
### Phase N: [Name]
[numbered steps]
```

## EXAMPLE

**Before:**
```
When you receive a task, you should first check if it has any 
dependencies. If it does, you need to wait for those dependencies 
to complete before you can start working on the task.
```

**After:**
```
ON task: IF deps exist AND any != COMPLETED → WAIT; ELSE → proceed
```

## SCORE TEMPLATE

```
| Criterion | Score | Issue |
|-----------|-------|-------|
| Clarity | /10 | |
| Brevity | /10 | |
| Structure | /10 | |
| Actionability | /10 | |
| Reliability | /10 | |
**Total: /50** → IF < 50: [fix] | IF = 50: ✅
```
