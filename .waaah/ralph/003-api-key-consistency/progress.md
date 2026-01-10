# Ralph Progress: API Key Consistency

## Task
Ensure API key check is done consistently on the server for all routes other than status/health ones

## Type: `code`

## Criteria
| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | 10 | Clear separation of public/protected routes with comments |
| completeness | 10 | All API routes protected, all static/SPA routes public |
| correctness | 10 | All 19 tests pass |

---

## Changes Made

### 1. Created `requireApiKey` Middleware
Added explicit middleware function in `server.ts`:
```typescript
function requireApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  if (providedKey !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    return;
  }
  next();
}
```

### 2. Route Protection Matrix

| Route | Auth | Purpose |
|-------|------|---------|
| `/health` | ❌ | Health check |
| `/admin/*.html`, `*.js`, `*.css` | ❌ | Static files |
| `/admin/dashboard`, `/admin/settings` | ❌ | SPA client-side routes |
| `/admin/tasks/*` | ✅ | Task API |
| `/admin/agents/*` | ✅ | Agent API |
| `/admin/stats`, `/admin/logs` | ✅ | Dashboard API |
| `/mcp/tools/*` | ✅ | Agent tools |
| `/debug/*` | ✅ | Debug endpoints |

### 3. Fixed SPA Fallback Route Ordering
Moved SPA fallback BEFORE protected routes with API path detection:
```typescript
app.get('/admin/*', (req, res, next) => {
  const apiPrefixes = ['/admin/tasks', '/admin/agents', ...];
  if (apiPrefixes.some(p => req.path.startsWith(p))) {
    return next(); // Let protected router handle
  }
  res.sendFile(...); // Serve index.html for SPA routes
});
```

### 4. Updated Configuration
- `vitest.config.ts`: Added `WAAAH_API_KEY: 'test-api-key-12345'`
- `.env.example`: Documented protected vs public routes
- `client/.env.example`: Updated client env documentation

### 5. Updated Tests
All test files now include `X-API-Key` header for protected routes:
- `server.test.ts`
- `spa.test.ts`
- `history_api.test.ts`

---

## Verification
- ✅ Build: Passed
- ✅ Tests: 19/19 passed
- ✅ Git: committed as `9d446db`

---

## ✅ COMPLETE

| Iter | Focus | Δ |
|------|-------|---|
| 0 | Initial implementation | +requireApiKey middleware |
| 1 | SPA fallback fix | +route ordering |
