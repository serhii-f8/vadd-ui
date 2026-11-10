## Job queue options

| | BullMQ | pg-boss ✅ | SQS |
| --- | ---: | ---: | ---: |
| p95 enqueue | 4 ms | 9 ms | 38 ms |
| Throughput | 12K/s | 3.5K/s | 3K/s |
| Monthly cost | €180 | €0 | €95 |
| New infra | Redis | none | AWS account |
| Exactly-once | no | yes | no |

Recommended: **pg-boss**.
