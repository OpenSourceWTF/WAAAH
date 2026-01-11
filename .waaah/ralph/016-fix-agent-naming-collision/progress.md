# Fix Agent Naming Collision

**Task:** Fix the naming collision issue where agents load a name from a previous session.

**Type:** `code`

**Criteria:** `clarity`, `completeness`, `correctness`

---

## Iteration 0: PLAN (v2)

### Root Cause
Agent workflows persist displayName between sessions, causing collisions when restarted.

### Fix
**Remove name persistence entirely.** Each startup = fresh server-assigned name.

### Changes

#### [MODIFY] waaah-orc-agent.md (lines 43-53)

Before:
```
IF exists .waaah/orc/agent.json:
  AGENT_ID = load(.waaah/orc/agent.json).id
  register_agent({ id: AGENT_ID })
ELSE:
  NAME = pick([...])
  AGENT_ID = register_agent({ displayName: NAME, ... })
  save(.waaah/orc/agent.json, { id: AGENT_ID, name: NAME })
```

After:
```
NAME = pick([curious,speedy,clever,jolly,nimble]) + " " +
       pick([otter,panda,fox,owl,penguin]) + " " + random(10-99)
result = register_agent({ displayName: NAME, role: "orchestrator" })
AGENT_ID = result.agentId
# No persistence — fresh name each startup
```

#### [MODIFY] waaah-doctor-agent.md

Same pattern — remove persistence logic.

---

*(Proceeding to EXECUTE)*
