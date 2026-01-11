# Acceptance Criteria: Bot Adapter Threading Refactoring

## Overview

Refactor `BaseAdapter`, `DiscordAdapter`, and `SlackAdapter` to centralize threading logic. The goal is to move `shouldThread` decision-making into `BaseAdapter` and ensure all adapters correctly populate `isThread` and `threadId` in `MessageContext`.

---

## User Stories

### US-1: As a developer, I want `BaseAdapter.shouldReplyInThread()` to determine threading behavior, so that threading logic is centralized.

**Acceptance Criteria:**
- [ ] `shouldReplyInThread(context: MessageContext, platformEnvKey: string): boolean` exists in `BaseAdapter`
- [ ] Returns `true` if `process.env[platformEnvKey] === 'true'` (force threading)
- [ ] Returns `true` if `context.isThread === true` (already in thread, continue in thread)
- [ ] Returns `false` otherwise (reply in main channel)
- [ ] `DiscordAdapter.reply()` calls `this.shouldReplyInThread(context, 'DISCORD_FORCE_THREADING')`
- [ ] `SlackAdapter.reply()` calls `this.shouldReplyInThread(context, 'SLACK_FORCE_THREADING')`

**Edge Cases:**
- `DISCORD_FORCE_THREADING=TRUE` (uppercase): Returns `false` (strict lowercase check)
- `DISCORD_FORCE_THREADING=yes`: Returns `false` (only `'true'` is valid)
- Env var undefined: Returns `false`
- `context.isThread` is `undefined`: Treated as `false`

**Error Scenarios:**
- N/A (pure boolean logic, no exceptions)

---

### US-2: As a developer, I want `MessageContext.isThread` populated correctly, so that threading state is known to all consumers.

**Acceptance Criteria:**
- [ ] `DiscordAdapter.connect()` sets `context.isThread = true` if message is in a Discord thread channel
- [ ] `SlackAdapter.connect()` sets `context.isThread = true` if `event.thread_ts` is defined
- [ ] For slash commands (Slack), `context.isThread = false` (no parent message)
- [ ] Type definition in `interface.ts` remains `isThread?: boolean` (optional)

**Edge Cases:**
- Discord DM channel: `isThread = false` (not a guild thread)
- Slack top-level message in channel: `isThread = false`
- Slack reply in thread: `isThread = true`

**Error Scenarios:**
- Unable to determine thread status: Default to `isThread = false`, no exception thrown

---

### US-3: As a developer, I want `MessageContext.threadId` populated when in a thread, so that replies can target the correct thread.

**Acceptance Criteria:**
- [ ] `DiscordAdapter.connect()` sets `context.threadId = channel.id` if in a thread channel
- [ ] `SlackAdapter.connect()` sets `context.threadId = event.thread_ts` if in a thread
- [ ] `context.threadId` is `undefined` if not in a thread
- [ ] Type definition in `interface.ts` remains `threadId?: string` (optional)
- [ ] `reply()` uses `context.threadId` to continue the thread when applicable

**Edge Cases:**
- Missing `event.thread_ts` (Slack): `threadId = undefined`
- Discord thread with null ID: `threadId = undefined`
- Slash command: `threadId = undefined` (no parent to thread on)

**Error Scenarios:**
- Invalid thread ID format: Logged as warning, `threadId = undefined`

---

### US-4: As a developer, I want threading tests in `shared.test.ts`, so that threading logic is verified.

**Acceptance Criteria:**
- [ ] Test case: `shouldReplyInThread` returns `true` when env var is `'true'`
- [ ] Test case: `shouldReplyInThread` returns `true` when `context.isThread === true`
- [ ] Test case: `shouldReplyInThread` returns `false` when env var unset and `isThread` is `false`
- [ ] Test case: `shouldReplyInThread` returns `false` when env var is `'TRUE'` or `'yes'`
- [ ] Mock `process.env` for env var tests
- [ ] All new tests pass in `pnpm run test -- shared.test`

**Edge Cases:**
- Test with mock context having only `isThread` set (no env var)
- Test with mock context having both `isThread = false` and env var `= 'true'` (env var wins)

**Error Scenarios:**
- N/A (unit tests)

---

## Non-Functional Requirements

### Performance
- No measurable latency from threading checks (O(1) operations)

### Maintainability
- All `shared.test.ts` tests pass
- Threading logic is documented in JSDoc
- No duplicate threading logic in child adapters

### Backward Compatibility
- Existing messages without `isThread`/`threadId` continue to work (defaults to `false`/`undefined`)
- No breaking changes to `MessageContext` interface (fields remain optional)

---

## Out of Scope

- New threading modes beyond force/auto-detect
- Thread-based task grouping in MCP server
- Thread-based notification channels
- Per-channel threading overrides

---

## Success Metrics

- **Test Coverage**: ≥4 new test cases in `shared.test.ts` for threading logic
- **Code Reduction**: Inline threading logic removed from `discord.ts` and `slack.ts`
- **Zero Regressions**: Threading behavior identical to before refactor
- **Clean Build**: `pnpm run build` produces no TypeScript errors

---

## Verification Plan

### Automated Tests
```bash
pnpm run test -- shared.test    # Threading unit tests pass
pnpm run build                   # TypeScript compiles without errors
```

### Manual Verification

#### Discord
1. Set `DISCORD_FORCE_THREADING=true`
2. Send message in main channel
3. Verify bot response creates/continues thread

4. Unset `DISCORD_FORCE_THREADING`
5. Send message in main channel
6. Verify bot response is in main channel

7. Send message inside existing thread
8. Verify bot response is in same thread

#### Slack
1. Set `SLACK_FORCE_THREADING=true`
2. Send message in main channel
3. Verify bot response creates thread

4. Unset `SLACK_FORCE_THREADING`
5. Send message in main channel
6. Verify bot response is in main channel

7. Reply inside existing thread
8. Verify bot response is in same thread

9. Use `/waaah` slash command
10. Verify response is in main channel (no thread)
