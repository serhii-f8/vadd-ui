## Auth refactor — changes

| File | + | − | Change |
| --- | ---: | ---: | --- |
| src/auth/refresh.ts | 64 | 12 | modified |
| src/auth/rotation.repo.ts | 88 | 0 | added |
| src/auth/session.ts | 9 | 31 | modified |
| src/auth/legacy-token.ts | 0 | 142 | deleted |
| migrations/0042_token_rotation.sql | 21 | 0 | added |
| test/auth/refresh.test.ts | 75 | 8 | modified |

6 files, +257 −193.

`src/auth/session.ts`:

```diff
@@ -40,7 +40,4 @@
-  const legacy = decodeLegacy(raw)
-  if (legacy) return upgrade(legacy)
+  return decode(raw)
```
