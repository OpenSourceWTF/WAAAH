# Ralph YOLO Progress: Separate Admin Dashboard into Package

**Objective**: Separate the admin dashboard into its own package (currently running as one with mcp-server)
**Type**: Code
**Criteria**: clarity, completeness, correctness

## Iteration 1

**Original Task:** Separate the admin dashboard into a separate package (its essentially running as one right now).
**Focus this iteration:** Plan structure and execute package extraction.
**Previous scores:** N/A

### Decision Log
- **Why this approach?**: Move `packages/mcp-server/client` → `packages/admin-dashboard` as a standalone Vite app. Update mcp-server to reference the new package's build output.
- **Alternates considered**: 
  - Submodule (too complex)
  - Monorepo workspace link (chosen - simple, works with pnpm)

### Execution Log

#### Current Structure
```
packages/mcp-server/
├── client/           # <-- This becomes packages/admin-dashboard
│   ├── package.json  # @opensourcewtf/waaah-admin-client
│   ├── src/
│   ├── vite.config.ts
│   └── ...
├── public/           # <-- Built assets from client
└── src/              # <-- Server code
```

#### Target Structure
```
packages/
├── admin-dashboard/  # NEW - standalone Vite app
│   ├── package.json  # @opensourcewtf/waaah-admin-dashboard
│   ├── src/
│   └── vite.config.ts
├── mcp-server/       # Server only
│   ├── public/       # Symlink or copy from admin-dashboard/dist
│   └── src/
└── types/            # Shared types
```

### Migration Steps
1. [/] Create `packages/admin-dashboard` by moving `packages/mcp-server/client`
2. [ ] Update package.json name to `@opensourcewtf/waaah-admin-dashboard`
3. [ ] Update vite.config.ts to output to correct location
4. [ ] Update mcp-server package.json to remove client build
5. [ ] Update mcp-server to serve assets from new location
6. [ ] Run `pnpm install` to update workspace links
7. [ ] Verify build and tests pass
