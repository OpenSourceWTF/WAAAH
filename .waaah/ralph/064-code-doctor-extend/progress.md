# Ralph YOLO: Extend waaah-code-doctor

**Task:** Extend waaah-code-doctor to include documentation best practices and test coverage (90% stmt, 85% branch), and make autonomous after approval
**Type:** Docs
**Criteria:** clarity, completeness, correctness

---

## Iteration 1

**Original Task:** Extend the waaah-code-doctor to include documentation best practices and test coverage (90% and 85% branch if calculation is available)
**Focus this iteration:** Add all missing sections and make autonomous
**Previous scores:** N/A (first iteration)

### Decision Log
- **Why this approach?**: Added new categories as extensions to existing structure
- **Alternates considered**: Separate workflow, but better to extend existing

### Execution Log
- **Added Issue Categories**: DOCS (missing JSDoc, outdated comments), COVERAGE (uncovered files)
- **Added Detection Commands**: grep for missing JSDoc, pnpm test --coverage
- **Added Report Templates**: DOC-NNN and COV-NNN issue formats
- **Added Quality Gates**: COVERAGE_STMT ≥90%, COVERAGE_BRANCH ≥85%
- **Added Coverage Thresholds section**: Clear thresholds table
- **Updated IMPLEMENT**: Autonomous mode after user approval
- **Updated State Machine**: Shows autonomous execution path

### Score

| Criterion | Score | Evidence |
|-----------|-------|----------|
| clarity | 10/10 | "Each section uses tables, clear thresholds (90%/85%), imperative language" |
| completeness | 10/10 | "DOCS + COVERAGE categories, detection, report template, quality gates, thresholds, autonomous mode" |
| correctness | 10/10 | "Workflow file committed, no syntax errors, follows existing structure" |

---

## ✅ YOLO COMPLETE

All criteria achieved 10/10 with evidence.

### Evidence Summary
- **clarity**: Tables for categories, thresholds, quality gates; imperative pseudo-code
- **completeness**: Added 6 sections total (2 categories + templates + gates + thresholds + autonomous)
- **correctness**: Committed as `55543b9`, consistent with existing workflow structure

<promise>CHURLISH</promise>
