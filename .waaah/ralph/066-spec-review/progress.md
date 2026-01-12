# Ralph YOLO: Add Spec Review to Doctor Workflows

**Task:** Add spec tracking and gap detection to code-doctor and doctor-agent
**Type:** Docs
**Criteria:** clarity, completeness, correctness

---

## Iteration 1

**Original Task:** Code doctor/doctor agent should look at specs, track last spec seen in state.json, evaluate each unreviewed spec against codebase, flag gaps in report, and doctor-agent should assign tasks for gaps.
**Focus this iteration:** Add SPEC category and state tracking to both workflows
**Previous scores:** N/A (first iteration)

### Decision Log
- **Why this approach?**: Extend existing categories with new SPEC category, update state.json schema
- **Alternates considered**: Separate spec-checker workflow, but better integrated into doctor

### Execution Log
- Updating waaah-code-doctor.md with SPEC category
- Updating waaah-doctor-agent.md with SPEC analysis and state tracking
