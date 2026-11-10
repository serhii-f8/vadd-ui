## Review of PR #482

- ✅ Token family revocation is covered by tests
- ✅ Rotation runs inside the refresh transaction
- ⚠️ `issuedAt` is computed but never stored (src/auth/refresh.ts:41)
- ❌ Old tokens stay valid after rotation (auth.spec.ts:88 reproduces it)
- ⚠️ Migration has no down step
- ⏭️ Load test not run
