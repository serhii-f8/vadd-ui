## nightly-reindex failed

**Job:** nightly-reindex · **Run:** #9041 · **Exit:** code 1 after 14m 02s

```
02:00:01 INFO  start reindex catalog_v7
02:03:44 INFO  batch 120/400 done
02:09:12 WARN  slow batch 233 (8.1 s)
02:13:58 ERROR batch 287: duplicate key value violates unique constraint "sku_pkey"
02:13:58 ERROR rollback batch 287
02:14:03 FATAL aborting after 3 failed batches
```
