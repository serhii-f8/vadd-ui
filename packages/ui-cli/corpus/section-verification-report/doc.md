## Objective #14 — refresh-token rotation

**Checks** 5/6 · **Tests** 142 (−3) · **Coverage** 87.4% · **Duration** 48.2 s

### Checks

- ✅ Typecheck (9.1 s)
- ✅ Unit tests (21.4 s)
- ❌ E2E (17.7 s): `auth.spec.ts:88  expected 401, got 200`

> ⚠️ E2E fails on expired-token replay. Rotation is not invalidating the old token.
