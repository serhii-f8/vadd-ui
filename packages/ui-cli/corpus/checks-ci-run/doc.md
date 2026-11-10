## CI run #2318 — feature/rotation

- ✅ **Install** — `pnpm install --frozen-lockfile` (18.4 s)
- ✅ **Typecheck** — `pnpm tsc -b` (9.1 s)
- ⚠️ **Lint** — `pnpm lint` (4.3 s)
  ```
  src/auth/refresh.ts:41  unused variable "issuedAt"
  ```
- ✅ **Unit tests** — `pnpm vitest run` (21.4 s)
- ❌ **E2E** — `pnpm e2e` (17.7 s)
  ```
  auth.spec.ts:88  expected 401, got 200
  auth.spec.ts:112  expected token to be revoked
  ```
- ⏭️ **Build** — `pnpm build` (skipped)
