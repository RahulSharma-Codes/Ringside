import React, { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BarChart3, Target, ListTodo, CalendarCheck, ClipboardCheck,
  FolderOpen, LineChart, Bot, Lightbulb, Upload, ShieldCheck,
  Plus, FileSpreadsheet, KeyRound, Building2, ChevronRight, Search,
  Pin, PinOff,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useListTargets, getListTargetsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const PAGE_ITEMS = [
  { href: "/",                 label: "Dashboard",        icon: BarChart3,      adminOnly: false },
  { href: "/pipeline",         label: "Pipeline",         icon: Target,         adminOnly: false },
  { href: "/actions",          label: "Actions",          icon: ListTodo,       adminOnly: false },
  { href: "/weekly-review",    label: "Weekly Review",    icon: CalendarCheck,  adminOnly: false },
  { href: "/diligence-review", label: "Diligence Review", icon: ClipboardCheck, adminOnly: false },
  { href: "/document-review",  label: "Document Review",  icon: FolderOpen,     adminOnly: false },
  { href: "/analytics",        label: "Analytics",        icon: LineChart,      adminOnly: false },
  { href: "/copilot",          label: "AI Copilot",       icon: Bot,            adminOnly: false },
  { href: "/doctrine",         label: "Doctrine",         icon: Lightbulb,      adminOnly: false },
  { href: "/import",           label: "Import",           icon: Upload,         adminOnly: false },
  { href: "/admin",            label: "Admin",            icon: ShieldCheck,    adminOnly: true  },
];

const QUICK_ACTIONS = [
  { label: "Add New Deal",   icon: Plus,           href: "/targets/new"       },
  { label: "Import CSV",     icon: FileSpreadsheet, href: "/import"            },
  { label: "Change Password",icon: KeyRound,        href: "/settings/password" },
];

const TIER_COLORS: Record<string, string> = {
  "Must-Win":  "bg-destructive/10 text-destructive border border-destructive/20",
  "Priority 1":"bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:text-amber-400",
  "Priority 2":"bg-primary/10 text-primary border border-primary/20",
  "Watchlist": "bg-muted text-muted-foreground border border-border/40",
};

const PINNED_STORAGE_KEY = "cmd-palette-pinned-deals";
const MAX_PINS = 5;

function loadPinnedIds(): number[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePinnedIds(ids: number[]): void {
  try {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function usePinnedDeals() {
  const [pinnedIds, setPinnedIdsState] = useState<number[]>(() => loadPinnedIds());

  const pin = useCallback((id: number) => {
    setPinnedIdsState((prev) => {
      if (prev.includes(id)) return prev;
      const next = [id, ...prev].slice(0, MAX_PINS);
      savePinnedIds(next);
      return next;
    });
  }, []);

  const unpin = useCallback((id: number) => {
    setPinnedIdsState((prev) => {
      const next = prev.filter((x) => x !== id);
      savePinnedIds(next);
      return next;
    });
  }, []);

  const toggle = useCallback((id: number) => {
    setPinnedIdsState((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        savePinnedIds(next);
        return next;
      }
      const next = [id, ...prev].slice(0, MAX_PINS);
      savePinnedIds(next);
      return next;
    });
  }, []);

  return { pinnedIds, pin, unpin, toggle };
}

function TierBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  return (
    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${TIER_COLORS[tier] ?? "bg-muted text-muted-foreground"}`}>
      {tier}
    </span>
  );
}

interface DealRowProps {
  id: number;
  projectName?: string | null;
  targetCode?: string | null;
  currentStage?: string | null;
  priorityTier?: string | null;
  isPinned: boolean;
  atPinLimit: boolean;
  onSelect: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
}

function DealRow({
  id,
  projectName,
  targetCode,
  currentStage,
  priorityTier,
  isPinned,
  atPinLimit,
  onSelect,
  onTogglePin,
}: DealRowProps) {
  return (
    <CommandItem
      key={id}
      value={[projectName, targetCode, currentStage, priorityTier].filter(Boolean).join(" ")}
      onSelect={onSelect}
      className="group flex items-center gap-2.5 cursor-pointer py-2 px-3 mx-1 rounded-xl data-[selected=true]:bg-primary/8 data-[selected=true]:text-primary"
    >
      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
        <Building2 size={12} className="text-primary/70" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-sans font-medium text-[13px] truncate">
          {projectName ?? targetCode ?? `Target #${id}`}
        </div>
        {currentStage && (
          <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 truncate">{currentStage}</div>
        )}
      </div>
      {priorityTier && <TierBadge tier={priorityTier} />}

      {/* Pin button — visible on hover or when pinned */}
      <button
        type="button"
        aria-label={isPinned ? "Unpin deal" : "Pin deal"}
        onClick={onTogglePin}
        title={
          isPinned
            ? "Unpin deal"
            : atPinLimit
            ? `Max ${MAX_PINS} pins reached`
            : "Pin deal"
        }
        className={[
          "shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all",
          "opacity-0 group-hover:opacity-100 focus:opacity-100",
          isPinned
            ? "opacity-100 text-amber-500 hover:text-amber-600 bg-amber-500/10 hover:bg-amber-500/20"
            : atPinLimit
            ? "opacity-100 text-muted-foreground/30 cursor-not-allowed"
            : "text-muted-foreground/40 hover:text-primary hover:bg-primary/10",
        ].join(" ")}
        disabled={!isPinned && atPinLimit}
      >
        {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
      </button>

      <ChevronRight size={11} className="shrink-0 text-muted-foreground/25" />
    </CommandItem>
  );
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const { pinnedIds, toggle } = usePinnedDeals();

  const { data: targets } = useListTargets(
    {},
    {
      query: {
        queryKey: getListTargetsQueryKey({}),
        enabled: open,
        staleTime: 60_000,
      },
    },
  );

  const visiblePages = PAGE_ITEMS.filter((p) => !p.adminOnly || isAdmin);

  const navigate = (href: string) => {
    onClose();
    setSearchQuery("");
    setTimeout(() => setLocation(href), 80);
  };

  const pinnedTargets = targets
    ? pinnedIds
        .map((id) => targets.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => t !== undefined)
    : [];

  const atPinLimit = pinnedIds.length >= MAX_PINS;

  const handleTogglePin = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(id);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) { onClose(); setSearchQuery(""); } }}>
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop — Radix Overlay provides aria-hidden + inert for background */}
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  key="palette-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                />
              </DialogPrimitive.Overlay>

              {/* Panel — Radix Content provides focus trap + escape + aria-modal */}
              <DialogPrimitive.Content asChild forceMount>
                <motion.div
                  key="palette-panel"
                  initial={{ opacity: 0, scale: 0.96, y: -12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: -12 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.8 }}
                  className="fixed left-1/2 top-[18%] -translate-x-1/2 z-50 w-full max-w-[540px] px-4 outline-none"
                >
                  <div className="rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                    <Command
                      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-muted-foreground/40"
                    >
                      {/* CommandInput manages its own search icon — do not wrap with another */}
                      <CommandInput
                        placeholder="Search deals, pages, actions…"
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                        className="font-sans text-[13px]"
                        autoFocus
                      />

                      <CommandList className="max-h-[420px] py-1.5">
                        <CommandEmpty>
                          <div className="flex flex-col items-center gap-3 py-10">
                            <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center">
                              <Search size={18} className="text-muted-foreground/30" />
                            </div>
                            <p className="font-sans text-[13px] text-muted-foreground/50">
                              {searchQuery
                                ? <>No results for <span className="font-semibold text-foreground/60">"{searchQuery}"</span></>
                                : "Start typing to search"}
                            </p>
                          </div>
                        </CommandEmpty>

                        {/* ── Pinned Deals ── */}
                        {pinnedTargets.length > 0 && (
                          <>
                            <CommandGroup heading={`Pinned (${pinnedTargets.length}/${MAX_PINS})`}>
                              {pinnedTargets.map((t) => (
                                <DealRow
                                  key={`pinned-${t.id}`}
                                  id={t.id}
                                  projectName={t.projectName}
                                  targetCode={t.targetCode}
                                  currentStage={t.currentStage}
                                  priorityTier={t.priorityTier}
                                  isPinned={true}
                                  atPinLimit={atPinLimit}
                                  onSelect={() => navigate(`/targets/${t.id}`)}
                                  onTogglePin={(e) => handleTogglePin(e, t.id)}
                                />
                              ))}
                            </CommandGroup>
                            <CommandSeparator className="my-1.5" />
                          </>
                        )}

                        {/* ── Deals ── */}
                        {targets && targets.length > 0 && (
                          <CommandGroup heading="Deals">
                            {targets.slice(0, 7).map((t) => (
                              <DealRow
                                key={t.id}
                                id={t.id}
                                projectName={t.projectName}
                                targetCode={t.targetCode}
                                currentStage={t.currentStage}
                                priorityTier={t.priorityTier}
                                isPinned={pinnedIds.includes(t.id)}
                                atPinLimit={atPinLimit}
                                onSelect={() => navigate(`/targets/${t.id}`)}
                                onTogglePin={(e) => handleTogglePin(e, t.id)}
                              />
                            ))}
                          </CommandGroup>
                        )}

                        {targets && targets.length > 0 && <CommandSeparator className="my-1.5" />}

                        {/* ── Pages ── */}
                        <CommandGroup heading="Pages">
                          {visiblePages.map((p) => {
                            const Icon = p.icon;
                            return (
                              <CommandItem
                                key={p.href}
                                value={p.label}
                                onSelect={() => navigate(p.href)}
                                className="flex items-center gap-2.5 cursor-pointer py-2 px-3 mx-1 rounded-xl data-[selected=true]:bg-primary/8 data-[selected=true]:text-primary"
                              >
                                <div className="w-7 h-7 rounded-lg bg-muted/80 border border-border/40 flex items-center justify-center shrink-0">
                                  <Icon size={13} className="text-muted-foreground/70" />
                                </div>
                                <span className="font-sans text-[13px]">{p.label}</span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>

                        <CommandSeparator className="my-1.5" />

                        {/* ── Quick Actions ── */}
                        <CommandGroup heading="Quick Actions">
                          {QUICK_ACTIONS.map((a) => {
                            const Icon = a.icon;
                            return (
                              <CommandItem
                                key={a.label}
                                value={a.label}
                                onSelect={() => navigate(a.href)}
                                className="flex items-center gap-2.5 cursor-pointer py-2 px-3 mx-1 rounded-xl data-[selected=true]:bg-primary/8 data-[selected=true]:text-primary"
                              >
                                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
                                  <Icon size={13} className="text-primary/70" />
                                </div>
                                <span className="font-sans text-[13px]">{a.label}</span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>

                      {/* Footer */}
                      <div className="flex items-center gap-3 px-3 py-2 border-t border-border/40 text-[10px] font-mono text-muted-foreground/30">
                        <span><kbd className="bg-muted/60 px-1.5 py-0.5 rounded-md text-[9px]">↑↓</kbd> navigate</span>
                        <span><kbd className="bg-muted/60 px-1.5 py-0.5 rounded-md text-[9px]">↵</kbd> select</span>
                        <span><kbd className="bg-muted/60 px-1.5 py-0.5 rounded-md text-[9px]">esc</kbd> close</span>
                      </div>
                    </Command>
                  </div>
                </motion.div>
              </DialogPrimitive.Content>
            </>
          )}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
