import React, { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, Target, ListTodo, CalendarCheck, ClipboardCheck,
  FolderOpen, LineChart, Bot, Lightbulb, Upload, ShieldCheck,
  Plus, FileSpreadsheet, KeyRound, Building2, ChevronRight, Search,
} from "lucide-react";
import {
  CommandDialog,
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
  { href: "/import",           label: "Import Targets",   icon: Upload,         adminOnly: false },
  { href: "/admin",            label: "Admin",            icon: ShieldCheck,    adminOnly: true  },
];

const QUICK_ACTIONS = [
  { label: "Add New Target", icon: Plus,           href: "/targets/new"       },
  { label: "Import CSV",     icon: FileSpreadsheet, href: "/import"            },
  { label: "Change Password",icon: KeyRound,        href: "/settings/password" },
];

const TIER_COLORS: Record<string, string> = {
  "Must-Win":  "bg-destructive/10 text-destructive border border-destructive/20",
  "Priority 1":"bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:text-amber-400",
  "Priority 2":"bg-primary/10 text-primary border border-primary/20",
  "Watchlist": "bg-muted text-muted-foreground border border-border/40",
};

function TierBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  return (
    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md shrink-0 ${TIER_COLORS[tier] ?? "bg-muted text-muted-foreground"}`}>
      {tier}
    </span>
  );
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();

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
    setTimeout(() => setLocation(href), 50);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
    >
      <div className="flex items-center gap-2 px-3 border-b border-border/60">
        <Search size={14} className="shrink-0 text-muted-foreground/50" />
        <CommandInput
          placeholder="Search deals, pages, actions…"
          className="font-sans text-[13px] border-0 outline-none ring-0 focus:ring-0 shadow-none px-0"
        />
        <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground/40 bg-muted px-1.5 py-0.5 rounded-md shrink-0">
          ESC
        </kbd>
      </div>
      <CommandList className="max-h-[420px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-10">
            <Search size={28} className="text-muted-foreground/20" />
            <span className="font-sans text-[13px] text-muted-foreground/60">
              No results found
            </span>
          </div>
        </CommandEmpty>

        {/* ── Deals ─────────────────────────────────────────────── */}
        {targets && targets.length > 0 && (
          <CommandGroup heading="Deals">
            {targets.slice(0, 8).map((t) => (
              <CommandItem
                key={t.id}
                value={[t.projectName, t.targetCode, t.currentStage, t.priorityTier].filter(Boolean).join(" ")}
                onSelect={() => navigate(`/targets/${t.id}`)}
                className="flex items-center gap-2.5 cursor-pointer py-2.5 px-3 mx-1 rounded-xl"
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
                  <Building2 size={12} className="text-primary/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] truncate">
                    {t.projectName ?? t.targetCode ?? `Target #${t.id}`}
                  </div>
                  {t.currentStage && (
                    <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 truncate">{t.currentStage}</div>
                  )}
                </div>
                {t.priorityTier && <TierBadge tier={t.priorityTier} />}
                <ChevronRight size={11} className="shrink-0 text-muted-foreground/25" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {targets && targets.length > 0 && <CommandSeparator />}

        {/* ── Pages ─────────────────────────────────────────────── */}
        <CommandGroup heading="Pages">
          {visiblePages.map((p) => {
            const Icon = p.icon;
            return (
              <CommandItem
                key={p.href}
                value={p.label}
                onSelect={() => navigate(p.href)}
                className="flex items-center gap-2.5 cursor-pointer py-2 px-3 mx-1 rounded-xl"
              >
                <div className="w-7 h-7 rounded-lg bg-muted/80 flex items-center justify-center shrink-0">
                  <Icon size={13} className="text-muted-foreground/70" />
                </div>
                <span className="font-sans text-[13px]">{p.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        {/* ── Quick Actions ─────────────────────────────────────── */}
        <CommandGroup heading="Quick Actions">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <CommandItem
                key={a.label}
                value={a.label}
                onSelect={() => navigate(a.href)}
                className="flex items-center gap-2.5 cursor-pointer py-2 px-3 mx-1 rounded-xl"
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon size={13} className="text-primary/70" />
                </div>
                <span className="font-sans text-[13px]">{a.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>

      {/* Footer hint */}
      <div className="flex items-center gap-3 px-3 py-2 border-t border-border/40 text-[10px] font-mono text-muted-foreground/35">
        <span><kbd className="bg-muted px-1 py-0.5 rounded text-[9px]">↑↓</kbd> navigate</span>
        <span><kbd className="bg-muted px-1 py-0.5 rounded text-[9px]">↵</kbd> select</span>
        <span><kbd className="bg-muted px-1 py-0.5 rounded text-[9px]">esc</kbd> close</span>
      </div>
    </CommandDialog>
  );
}
