## Files touched by the rotation work

```
src/
├── auth/
│   ├── refresh.ts            ✅ rotates on refresh
│   ├── rotation.repo.ts      ✅ new
│   └── session.ts            ⚠️ legacy path removed
└── db/
    └── pool.ts               ✅
migrations/
└── 0042_token_rotation.sql   ✅ new
test/
└── auth/
    └── refresh.test.ts       ❌ 2 failing
```
