# Data Layer Overhaul Specification

**Version:** 0.3 | **Status:** PHASE 1 - Interview

---

## Criteria

| Criterion | Definition |
|-----------|------------|
| simplicity | Minimal changes, easy to maintain |
| performance | Reduce request count, improve latency |
| reliability | Persistence, no data loss |

---

## Requirements

| Requirement | Answer |
|-------------|--------|
| Users | <10 simultaneous |
| Tasks | 100s |
| Agents | 10s |
| Persistence | Yes |
| Deployment | Single server |
| Transport | WebSocket (Socket.io) |

---

## Design Decisions

### 1. Event Taxonomy
**Pattern:** `{entity}:{id}:{action}` with wildcard support

| Event | Example | Wildcard |
|-------|---------|----------|
| Task updated | `task:abc123:updated` | `task:*:updated` |
| Task created | `task:def456:created` | `task:*:created` |
| Agent status | `agent:orc-01:status` | `agent:*:status` |
| Global refresh | `sync:full` | — |

**Implementation:** Socket.io rooms or custom wildcard matcher.

### 2. Initial Load (RECOMMENDED)
**Hybrid approach:**
- On connect: server sends `sync:full` with current state snapshot
- REST endpoints remain for pagination (completed/cancelled tasks)

**Why:** Avoids race condition between connect and first update. Client has immediate state.

### 3. Reconnection (RECOMMENDED)
**Auto-reconnect + delta sync:**
- Socket.io has built-in reconnection
- On reconnect: client sends `lastEventTimestamp`
- Server sends missed events OR `sync:full` if too many

**Why:** Minimal data transfer, graceful degradation.

### 4. REST Endpoints (RECOMMENDED)
**Keep both:**
- WebSocket for real-time dashboard
- REST for pagination, search, CLI tools, external integrations

**Why:** Backward compat, different use cases.

---

## Architecture

```
┌─────────────────────────────────────────┐
│          Browser (Dashboard)             │
│  ┌─────────────────────────────────────┐│
│  │ Socket.io Client                    ││
│  │   - Subscribe: task:*:*, agent:*:*  ││
│  │   - On connect: receive sync:full   ││
│  └─────────────────────────────────────┘│
└──────────────────┬──────────────────────┘
                   │ ws://
┌──────────────────▼──────────────────────┐
│        Express + Socket.io Server        │
│  ┌─────────────────────────────────────┐│
│  │ EventBus (in-memory)                ││
│  │   - On task change: emit to room    ││
│  │   - Wildcard matching via regex     ││
│  └──────────────────┬──────────────────┘│
│                     │                    │
│  ┌──────────────────▼─────────────────┐ │
│  │ SQLite (no change)                 │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ REST API (kept for compat)         │ │
│  └────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

---

## Score: 8/10

### Remaining Gaps
1. **Payload schema** — what data does each event carry?
2. **Error events** — how are errors communicated?
3. **Auth** — WebSocket authentication strategy?

---

## Questions

1. **Payload:** Full entity on update, or just changed fields (patch)?

2. **Errors:** Emit `error` event, or include in response?

3. **Auth:** Use existing API key in WS handshake, or session-based?
