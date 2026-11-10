## Connection pool fix

> ℹ️ The pool was capped at 10 while the worker runs 32 jobs; raise it and fail fast on exhaustion.

```ts
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 40,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
})
```

Changed lines: 3–5.
