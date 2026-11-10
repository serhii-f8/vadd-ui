## Cache layer for catalog queries

**Which cache should front the catalog queries?** p95 is 212 ms on `searchSku`; the SLO is 100 ms.

1. **In-process LRU** — effort S, reversible, low risk
   - Pros: No infra; Sub-millisecond hits
   - Cons: Per-pod, cold after deploys
2. **Redis** ✅ recommended — effort M, reversible, medium risk
   - Pros: Shared across pods; Survives deploys
   - Cons: New dependency
   - Verify: p95 < 80 ms in the bench
3. **Materialized view** — effort L, not reversible, medium risk
   - Pros: No cache invalidation
   - Cons: Refresh lag of 5 min
