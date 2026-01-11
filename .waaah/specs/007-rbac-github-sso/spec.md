# RBAC + GitHub SSO Specification
**Version:** 1.0 | **Status:** Ready

## 1. Overview
**Problem:** Dashboard has no authentication. Anyone can submit/cancel tasks.
**Users:** Team leads, developers, read-only stakeholders.
**Solution:** GitHub OAuth SSO with role-based access control.

## 2. User Stories
- [ ] US-1: As an admin, I want to control who can submit tasks
- [ ] US-2: As a viewer, I want read-only dashboard access
- [ ] US-3: As an owner, I want to manage user roles

## 3. Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | **GitHub OAuth**: Login via GitHub OAuth 2.0 |
| FR-2 | **Role System**: Read, Read-Write, Admin, Owner |
| FR-3 | **Permission Matrix**: See table below |
| FR-4 | **Session Management**: JWT tokens, secure cookies |
| FR-5 | **User Management UI**: Admin panel for role assignment |
| NFR-1 | OAuth callback must complete in <3s |
| NFR-2 | Session expiry: 7 days with refresh |

### Permission Matrix

| Action | Read | Read-Write | Admin | Owner |
|--------|------|------------|-------|-------|
| View dashboard | ✅ | ✅ | ✅ | ✅ |
| View task details | ✅ | ✅ | ✅ | ✅ |
| Submit spec/task | ❌ | ✅ | ✅ | ✅ |
| Cancel task | ❌ | ✅ | ✅ | ✅ |
| Approve/Reject | ❌ | ❌ | ✅ | ✅ |
| Evict agent | ❌ | ❌ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ✅ |
| Delete workspace | ❌ | ❌ | ❌ | ✅ |

## 4. Edge Cases

| Scenario | Behavior |
|----------|----------|
| GitHub OAuth denied | Show error, redirect to login |
| Token expired mid-session | Redirect to re-auth |
| Owner tries to demote self | Block action |

## 5. Out of Scope
- SAML/OIDC providers (GitHub only for v1)
- Fine-grained per-task permissions
- API key management

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Login success rate | >99% |
| Auth latency | <500ms |

---

## Implementation Tasks

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| T1 | **DB: User + Role Schema** | S | — | Migration runs without error |
| T2 | **API: GitHub OAuth Flow** | M | T1 | `/auth/github` redirects to GitHub |
| T3 | **API: OAuth Callback Handler** | M | T2 | Callback creates user in DB |
| T4 | **API: JWT Session Middleware** | M | T3 | Protected routes return 401 without token |
| T5 | **UI: Login Page** | S | T2 | "Login with GitHub" button works |
| T6 | **API: Permission Middleware** | M | T4 | Role checks on protected actions |
| T7 | **UI: User Management Panel** | M | T1,T6 | Owner can assign roles |
| T8 | **API: Role Assignment Endpoint** | S | T1,T6 | `PUT /admin/users/:id/role` |

## Verification Tasks (E2E)

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| V1 | **E2E: Login Flow** | M | T5 | `pnpm test -- auth.e2e --grep login` |
| V2 | **E2E: Permission Enforcement** | M | T6 | Read user cannot submit tasks |
| V3 | **E2E: Role Management** | M | T7,T8 | Owner promotes user to Admin |
