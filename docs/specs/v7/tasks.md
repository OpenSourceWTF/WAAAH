# V7 Master Task List

This is the execution checklist for V7 implementation.

## Phase 1: Core Tools & Schema
- [x] **T1**: Revert/Redirect Worktree Logic (Agent-Led Strategy) <!-- spec: S1 -->
- [x] **T2**: Standardize `run_command` Worktree Management <!-- spec: S1 -->
- [x] **T8**: Add `spec` Field to Schema <!-- spec: S4 -->
- [x] **T9**: Store Spec in Task <!-- deps: [T8], spec: S4 -->
- [x] **T12**: Remove Hardcoded Delegation Rules <!-- spec: S7 -->
- [x] **T17**: Add `displayName` to Agent Schema <!-- spec: S11 -->
- [x] **T18**: Implement Agent Name Generator <!-- deps: [T17], spec: S11 -->

## Phase 2: Branding, Skills & Parallelization
- [x] **T3**: Rename Workflow File <!-- spec: S2 -->
- [x] **T4**: Update Config Aliases <!-- deps: [T3], spec: S2 -->
- [x] **T5**: Add `name:` to All Workflows <!-- deps: [T3], spec: S3 -->
- [x] **T6**: Create Claude Skills Symlink <!-- deps: [T5], spec: S3 -->
- [x] **T7**: Update `waaah init` CLI <!-- deps: [T6], spec: S3 -->
- [x] **T11**: Implement `waaah assign` Parallelization <!-- deps: [T9], spec: S6 -->
- [x] **T13**: Ensure Capabilities Mandatory on Registration <!-- deps: [T12], spec: S7 -->
- [x] **T14**: Implement `waaah init` with Templates <!-- deps: [T6], spec: S8 -->
- [x] **T16**: Implement `waaah task` command <!-- spec: S10 -->
- [x] **T19**: Implement Workspace Context Inference <!-- deps: [T13], spec: S12 -->
- [x] **T20**: Agent Registers with Workspace <!-- deps: [T19], spec: S12 -->
- [x] **T21**: Implement Dashboard Comments <!-- spec: S13 -->
- [x] **T22**: Implement Descriptive Task Titles <!-- spec: S14 -->

## Phase 3: Review & Workflow Logic
- [x] **T23**: Spec Review Flow <!-- spec: S15 -->
- [x] **T24**: Enhance `/approve` (Status Transition only) <!-- spec: S15 -->
- [x] **T25**: Implement `/reject` (Worktree Preservation) <!-- spec: S15 -->
- [x] **T26**: Revert `ack_task` to Simple Handshake <!-- deps: [T25], spec: S15 -->
- [x] **T27**: Verify Dashboard Review UI Actions <!-- deps: [T24, T25], spec: S15 -->
- [x] **T28**: Implement Expanding Card Animation <!-- spec: S16 -->
- [x] **T29**: Verify Progress Updates in Timeline <!-- spec: S17 -->
- [x] **T30**: Extend Agent API for Telemetry <!-- deps: [T17], spec: S16 -->
- [x] **T31**: Forensic re-implementation of deleted session work <!-- spec: S29 -->

## Phase 4: Cleanup
- [x] **T10**: Delete Legacy Files <!-- deps: [T3, T6], spec: S5 -->
- [x] **T15**: Delete Deprecated Workflows <!-- deps: [T3], spec: S9 -->
