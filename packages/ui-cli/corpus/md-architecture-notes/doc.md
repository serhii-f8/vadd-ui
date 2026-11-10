## Why rotation lives in the refresh transaction

### Decision

Rotation writes the new token and revokes the old one in **one transaction**, so a crash can never leave two live tokens.

### Consequences

- A refresh takes one extra write (about 2 ms).
- Reuse detection reads `token_family` by index.
- Rollback restores the old token, which is still valid.

> Measured on staging: p95 refresh went from 38 ms to 41 ms.
