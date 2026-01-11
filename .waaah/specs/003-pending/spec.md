# Data Layer Overhaul Specification

**Version:** 0.2 | **Status:** PHASE 1 - Interview

---

## Criteria

| Criterion | Definition |
|-----------|------------|
| simplicity | Minimal changes, easy to maintain |
| performance | Reduce request count, improve latency |
| reliability | Persistence, no data loss |

---

## Requirements (from user)

| Question | Answer |
|----------|--------|
| Freshness | ASAP (real-time preferred) |
| Scale | <10 users, 100s tasks, 10s agents |
| Persistence | Yes (survive restarts) |
| Complexity | A or B (simple or tRPC) |
| Deployment | Single server |

---

## tRPC vs WebSocket Analysis

**tRPC:**
- ✅ End-to-end type safety
- ✅ Great DX with TypeScript
- ⚠️ **Does NOT improve speed** — still HTTP requests under the hood
- ⚠️ Subscriptions require WebSocket transport anyway

**WebSocket (Socket.io or native):**
- ✅ True push — server can send updates instantly
- ✅ Single connection vs many HTTP requests
- ✅ Works with current SQLite + Express
- ⚠️ Requires new event architecture

**Recommendation:** **WebSocket (Socket.io)** — simplest path to real-time with minimal migration. tRPC would add complexity without speed gains.

---

## Proposed Architecture

```
┌─────────────────────────────────────────┐
│                Browser                   │
│  ┌─────────────────────────────────────┐│
│  │ WebSocket Client (Socket.io-client) ││
│  │   - Subscribe to: tasks, agents     ││
│  │   - Receive: push updates           ││
│  └─────────────────────────────────────┘│
└──────────────────┬──────────────────────┘
                   │ ws://
┌──────────────────▼──────────────────────┐
│           Express + Socket.io            │
│  ┌─────────────────────────────────────┐│
│  │ Event Emitter (in-memory)           ││
│  │   - task:created, task:updated      ││
│  │   - agent:status, agent:heartbeat   ││
│  └─────────────────────────────────────┘│
│                    │                     │
│  ┌─────────────────▼─────────────────┐  │
│  │ SQLite (better-sqlite3)           │  │
│  │   - No change needed              │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## Score: 6/10

### Gaps Remaining
1. **Event taxonomy** — which events, what payloads?
2. **Initial state** — how does client get data on connect?
3. **Reconnection** — what happens on disconnect?
4. **Backward compat** — keep REST endpoints for non-WS clients?

---

## Questions

1. **Events:** Should we emit per-entity (task:123:updated) or per-type (tasks:updated)?

2. **Initial Load:** On connect, send full state or let client fetch via REST?

3. **Reconnection:** Auto-reconnect + refetch, or resume from last known state?

4. **REST:** Keep REST endpoints alongside WebSocket, or deprecate?
