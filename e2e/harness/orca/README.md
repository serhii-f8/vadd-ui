# Vendored Orca sources

Byte-for-byte copies from `stablyai/orca`, commit `f5cdfc76b703098b0b22bbcb5ec80e156bedefb1` (refreshed 2026-11-17, VD-208; first copied from `afac091`), MIT (`LICENSE`), for the Orca shell harness of §16. Paths under `src/` match Orca's, so its relative import works unchanged. The CSP, token list and frame attributes were checked against the installed Orca 1.4.248 (VD-009, VD-063). `packages/ui-spec/src/host/orca.ts` pins the same constants, and `e2e/orca-chat.spec.ts` compares them with these files. Do not edit these files: refresh them from a newer commit.
