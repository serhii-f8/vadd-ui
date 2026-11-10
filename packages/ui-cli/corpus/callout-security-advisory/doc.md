## Dependency advisory

> ⛔ **GHSA-7x4q-2m9c: prototype pollution in json-merge 2.1.0**
>
> Reachable from `src/config/load.ts` through user-supplied YAML. Upgrade to **2.1.4** before the next release.

1. Run `pnpm up json-merge@2.1.4`
2. Re-run the config loader tests
3. Ship in 2026.11.3
