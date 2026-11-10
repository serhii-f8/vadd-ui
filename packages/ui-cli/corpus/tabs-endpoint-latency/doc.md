## API latency by endpoint

### Read

| Endpoint | Calls | p50 | p95 |
| --- | ---: | ---: | ---: |
| GET /products | 182,400 | 18 ms | 64 ms |
| GET /products/:id | 96,100 | 12 ms | 41 ms |
| GET /cart | 54,300 | 22 ms | 88 ms |
| GET /orders ⚠️ | 12,800 | 35 ms | 140 ms |

### Write

| Endpoint | Calls | p50 | p95 |
| --- | ---: | ---: | ---: |
| POST /cart/items | 31,200 | 28 ms | 95 ms |
| POST /checkout ❌ | 8,700 | 140 ms | 420 ms |
| PATCH /profile | 2,100 | 31 ms | 77 ms |
