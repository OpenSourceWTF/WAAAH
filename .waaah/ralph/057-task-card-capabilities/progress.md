# Ralph YOLO Progress: Add Capabilities/Workspace to Task Cards

**Objective**: Add capabilities and workspace on the collapsed task card in the same style that the agent cards have
**Type**: Code
**Criteria**: clarity, completeness, correctness

## Iteration 1

**Original Task:** I want you to add capabilities and workspace on the collapsed task card in the same style that the agent cards have
**Focus this iteration:** Add capability badges and workspace display to collapsed task cards
**Previous scores:** N/A

### Decision Log
- **Why this approach?**: Copy styling from AgentCard.tsx lines 102-127 to KanbanBoard task cards
- **Alternates considered**: Create shared component (rejected - overkill for simple styling match)

### Reference Styling (from AgentCard.tsx)
```tsx
{/* Capabilities */}
<div className="flex flex-wrap gap-1">
  {agent.capabilities.slice(0, 5).map(cap => (
    <span key={cap} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 border border-primary/20">{cap}</span>
  ))}
  {agent.capabilities.length > 5 && <span className="text-[9px] text-primary/50">+{agent.capabilities.length - 5} more</span>}
</div>

{/* Workspace */}
<div className="text-[9px] font-mono text-primary/70 bg-black/20 px-1.5 py-1 border border-primary/20 truncate">
  {agent.workspaceContext.repoId}
</div>
```

### Execution Log
