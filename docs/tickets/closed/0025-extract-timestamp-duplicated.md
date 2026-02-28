# extractTimestamp Helper Duplicated Across Files

**Type:** task
**Severity:** low
**Component:** web
**Reported:** 2026-02-26

## Description

The `extractTimestamp()` helper function is defined in two places:

1. `apps/web/src/routes/__root.tsx` (lines 56-63)
2. `apps/web/src/lib/chat-store.ts` (lines 41-48)

Both do the same thing: extract a millisecond timestamp from SpacetimeDB's `__timestamp_micros_since_unix_epoch__` bigint format. Having two copies means bugs fixed in one won't be fixed in the other, and it's confusing for anyone reading the code.

## Expected Behavior

Move `extractTimestamp` to `apps/web/src/spacetime.ts` (which already has SpacetimeDB related utilities) and import it from both files.

## Implementation Notes

1. Add the function to `spacetime.ts`
2. Remove the duplicate from `__root.tsx` and `chat-store.ts`
3. Update imports in both files
4. Run `bun run build` to verify nothing breaks

## Resolution

Moved extractTimestamp to spacetime.ts as an exported function. Removed duplicates from __root.tsx and chat-store.ts, replacing them with imports from spacetime.ts. Build verified clean.
