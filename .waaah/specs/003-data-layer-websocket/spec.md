# Data Layer Overhaul Specification

**Version:** 1.0 | **Status:** Ready

---

## Criteria

| Criterion | Score | Notes |
|-----------|-------|-------|
| simplicity | 10 | Minimal changes to existing stack |
| performance | 10 | Push vs 180 req/min polling |
| reliability | 10 | SQLite persistence + graceful reconnect |

---

## Requirements

| Requirement | Value |
|-------------|-------|
| Users | <10 simultaneous |
| Tasks | 100s |
| Agents | 10s |
| Latency | Real-time (push) |
| Persistence | Yes (SQLite) |
| Deployment | Single server |

---

## Architecture

```
┌─────────────────────────────────────────┐
│          Browser (Dashboard)             │
│  Socket.io Client                        │
│   - Auth: API key in handshake           │
│   - Subscribe: task:*:*, agent:*:*       │
│   - On connect: receive sync:full        │
└──────────────────┬──────────────────────┘
                   │ wss://
┌──────────────────▼──────────────────────┐
│        Express + Socket.io Server        │
│  ┌─────────────────────────────────────┐│
│  │ Auth Middleware                     ││
│  │   - Validate API key on handshake   ││
│  │   - Reject unauthenticated clients  ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ EventBus                            ││
│  │   - Emit on DB write                ││
│  │   - Wildcard matching               ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ SQLite (unchanged)                  ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ REST API (kept for compat)          ││
│  └─────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

---

## Event Taxonomy

| Event | Payload | Notes |
|-------|---------|-------|
| `sync:full` | `{ tasks: [...], agents: [...] }` | On connect |
| `task:{id}:created` | Full task object | New task |
| `task:{id}:updated` | `{ id, ...patch }` | Changed fields only |
| `task:{id}:deleted` | `{ id }` | Task removed |
| `agent:{id}:status` | `{ id, status, lastSeen }` | Status change |
| `error` | `{ code, message }` | Server error |

### Patch Payload (SQLite-Compatible)

**Yes, patches work fine with SQLite.** The DB stores full rows; the patch is just the *event payload* design:

```typescript
// On task update:
const patch = { status: 'IN_PROGRESS', assignedTo: 'agent-1' };
io.emit(`task:${task.id}:updated`, { id: task.id, ...patch });

// Client merges:
setTasks(prev => prev.map(t => t.id === patch.id ? { ...t, ...patch } : t));
```

---

## Authentication

```typescript
// Server
io.use((socket, next) => {
  const apiKey = socket.handshake.auth.apiKey;
  if (apiKey !== process.env.WAAAH_API_KEY) {
    return next(new Error('Unauthorized'));
  }
  next();
});

// Client
const socket = io(url, {
  auth: { apiKey: import.meta.env.VITE_WAAAH_API_KEY }
});
```

---

## Error Handling

**Emit `error` event** — clean separation, client can handle globally:

```typescript
// Server
socket.emit('error', { code: 'TASK_NOT_FOUND', message: 'Task xyz not found' });

// Client
socket.on('error', (err) => toast.error(err.message));
```

---

## Reconnection

1. Socket.io auto-reconnects (built-in)
2. On reconnect: server sends `sync:full`
3. No delta sync needed for <10 users (simple is better)

---

## Migration Path

| Phase | Changes |
|-------|---------|
| 1 | Add Socket.io to server, implement EventBus |
| 2 | Add auth middleware |
| 3 | Emit events on task/agent writes |
| 4 | Update client hooks to use WebSocket |
| 5 | Remove polling (keep REST for compat) |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Client disconnects | Auto-reconnect, sync:full on reconnect |
| Invalid API key | Connection rejected with error |
| Server restart | Clients reconnect, receive fresh state |
| Event burst | Socket.io handles buffering |

---

## Out of Scope

- Multi-server deployment (would need Redis pub/sub)
- GraphQL subscriptions (overkill for this scale)
- Offline support (not needed for dashboard)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Request reduction | 180/min → 0 polling |
| Update latency | <100ms |
| Migration effort | <1 day |
