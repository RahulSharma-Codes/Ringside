---
name: Floating nav rail pattern
description: How the desktop nav rail hover-expands and what CommandPalette prop it needs
---

## CSS group-hover expand

The desktop nav rail uses Tailwind's `group/rail` + `group-hover/rail:*` pattern to expand from 48px collapsed → 220px on hover. No JavaScript state, no toggle button — pure CSS transitions on the `w-12 hover:w-[220px]` classes.

Labels and wordmark are hidden with `hidden group-hover/rail:flex` / `hidden group-hover/rail:block` so they only appear when expanded.

**Why:** Avoids the "accidental toggle" UX problem with click-based collapse; hover expansion feels more fluid and less disruptive while working.

**How to apply:** Keep the `group/rail` class on the `<div>` wrapper and use `group-hover/rail:*` variants on any child that should reveal on hover.

## CommandPalette prop

`CommandPalette` uses `onClose: () => void` — NOT `onOpenChange`. Using `onOpenChange` causes a TypeScript error.

**Why:** The palette is now implemented with a custom Framer Motion AnimatePresence dialog (not shadcn's CommandDialog), so the open/close lifecycle is managed internally. The parent only needs a close callback.
