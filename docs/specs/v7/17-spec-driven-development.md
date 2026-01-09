# S17: Spec-Driven Development

## Context
WAAAH supports spec-driven development to ensure structured, verifiable work. Tasks can optionally include specification documents that guide agent execution.

## Relationship to ARCHITECTURE.md
Per **Section 3.5 (Spec-Driven Development)**, agents should use embedded specs as the source of truth. If no spec is provided, agents generate their own inline before implementation.

## Requirements

### Schema Updates (`assign_task`)
- Add optional `spec` field: Raw text of specification document (e.g., `spec.md` contents)
- Add optional `tasks` field: Raw text of task checklist (e.g., `tasks.md` contents)

### Agent Behavior Updates (waaah-orc)
1. **Spec Detection Phase**:
   - Check if `ctx.spec` or `ctx.tasks` is provided
   - If yes: Use as source of truth for requirements
   - If no: Generate inline spec before starting implementation

2. **Testing Phase (TDD)**:
   - Write tests BEFORE implementation
   - Run tests → Should fail
   - Implement code
   - Run tests → Should pass

3. **Documentation Phase**:
   - After passing tests, add inline documentation using **TSDoc** format
   - Document all exported functions, classes, and interfaces
   - Include `@param`, `@returns`, `@throws`, and usage examples

### CLI Integration (`waaah assign`)
- When `waaah assign spec.md` is invoked, read file contents and attach to `assign_task` call
- Support `--spec <file>` and `--tasks <file>` flags

## Verification
- [ ] Schema allows optional `spec` and `tasks` fields
- [ ] Agent workflow checks for spec before planning
- [ ] Agent generates spec if none provided
- [ ] Tests written before implementation
- [ ] TSDoc comments added to exported code

## Status
TODO
