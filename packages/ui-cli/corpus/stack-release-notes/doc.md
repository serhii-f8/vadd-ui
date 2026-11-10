## Release 2026.11.2

Rotation of refresh tokens, a faster catalog search, and two fixes.

**Added**
- Refresh-token rotation with reuse detection
- Redis cache in front of catalog search

**Fixed**
- Checkout no longer double-charges on retry (#4471)
- Profile page keeps the selected locale (#4502)

**Removed**
- Legacy token format, unused since 2026.06
