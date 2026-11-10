## Refresh-token rotation

Progress: 2 of 7 done.

- [x] Add rotation table and repository
- [x] Issue a new refresh token on every refresh
- [ ] 🔄 Invalidate the previous token — replay test still passes the old token
- [ ] Replay protection
  - [ ] Detect reuse of a rotated token
  - [ ] Revoke the whole token family on reuse
- [ ] ~~Document the rotation in the API guide~~ — skipped: next release
