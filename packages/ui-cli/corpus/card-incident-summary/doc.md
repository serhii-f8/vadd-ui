## Incident INC-311

| | |
| --- | --- |
| Severity | SEV-2 |
| Status | Mitigated |
| Started | 09:25 UTC |
| Duration | 23 min |
| Impact | 0.9% of checkouts failed |
| Owner | payments on-call |

✅ Canary rolled back at 09:27; error rate back to 0.1% by 09:48.

**Cause:** the payment client retried on `409 Conflict`, creating duplicate intents. **Follow-up:** treat 409 as final; add a test.
