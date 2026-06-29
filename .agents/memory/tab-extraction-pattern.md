---
name: Tab extraction pattern for target-detail
description: How self-contained tab components are extracted from the target-detail shell; mobile bar bridge pattern; Express mergeParams typing fix
---

## Rule
When extracting a tab component from target-detail.tsx into its own file, make it fully self-contained (owns its own queries, mutations, and modal state). Only pass `targetId` + a two-prop mobile-bar bridge when the tab has an "add" action the mobile bottom bar must trigger.

**Why:** The shell was 2,288 lines because all tab state lived there. Self-contained tabs prevent re-accumulation.

## Mobile bar bridge pattern
```tsx
// Shell keeps minimal state:
const [interactionAddOpen, setInteractionAddOpen] = useState(false);
// Passes to tab:
<InteractionsTab addOpen={interactionAddOpen} onAddOpenChange={setInteractionAddOpen} />
// Tab reads:
useEffect(() => {
  if (addOpen) { setInteractionOpen(true); onAddOpenChange(false); }
}, [addOpen, onAddOpenChange]);
```

## Express sub-router params with mergeParams
When a sub-router is mounted with `Router({ mergeParams: true })` and the parent has a `:id` param, TypeScript types `req.params` as `{}` (empty object). Fix:
```ts
const id = parseInt((req.params as { id: string }).id, 10);
```
NOT `req.params.id as string` — the property access fails before the cast.

## Known pre-existing errors (do not fix in refactor tasks)
- `advisors.ts` — `advisorConflictNotesTable` missing from @workspace/db
- `target-detail-stakeholders.tsx` — 3 hooks missing from @workspace/api-client-react

## OverviewTab action data gap
After extraction, OverviewTab receives `actions={[]}` from the shell. Task #164 tracks fixing this — OverviewTab should call `useListActions(targetId)` directly so React Query deduplicates with ActionsTab's cache.
