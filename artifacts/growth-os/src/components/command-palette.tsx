import React from "react";
import { useLocation } from "wouter";
import {
  BarChart3, Target, ListTodo, CalendarCheck, ClipboardCheck,
  FolderOpen, LineChart, Bot, Lightbulb, Upload, ShieldCheck,
  Plus, FileSpreadsheet, KeyRound, Building2, ChevronRight,
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
  "Tier 1": "bg-rose-500/15 text-rose-400 border border-rose-500/20",
  "Tier 2": "bg-amber-500/15 text-amber-500 border border-amber-500/20",
  "Tier 3": "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  "Tier 4": "bg-muted text-muted-foreground border border-border/40",
};

function TierBadge({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  return (
    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-sm shrink-0 ${TIER_COLORS[tier] ?? "bg-muted text-muted-foreground"}`}>
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
      <CommandInput
        placeholder="Search deals, pages, actions…"
        className="font-mono text-[13px]"
      />
      <CommandList className="max-h-[440px]">
        <CommandEmpty>
          <span className="font-mono text-[12px] text-muted-foreground">
            No results found.
          </span>
        </CommandEmpty>

        {/* ── Deals ─────────────────────────────────────────────── */}
        {targets && targets.length > 0 && (
          <CommandGroup heading="Deals">
            {targets.map((t) => (
              <CommandItem
                key={t.id}
                value={[t.projectName, t.targetCode, t.currentStage, t.priorityTier].filter(Boolean).join(" ")}
                onSelect={() => navigate(`/targets/${t.id}`)}
                className="flex items-center gap-2.5 cursor-pointer py-2"
              >
                <Building2 size={13} className="shrink-0 text-muted-foreground/60" />
                <span className="flex-1 font-mono text-[12px] truncate min-w-0">
                  {t.projectName ?? t.targetCode ?? `Target #${t.id}`}
                </span>
                {t.priorityTier && <TierBadge tier={t.priorityTier} />}
                {t.currentStage && (
                  <span className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[100px] hidden sm:block">
                    {t.currentStage}
                  </span>
                )}
                <ChevronRight size={11} className="shrink-0 text-muted-foreground/30" />
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
                className="flex items-center gap-2.5 cursor-pointer py-2"
              >
                <Icon size={13} className="shrink-0 text-muted-foreground/60" />
                <span className="font-mono text-[12px]">{p.label}</span>
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
                className="flex items-center gap-2.5 cursor-pointer py-2"
              >
                <Icon size={13} className="shrink-0 text-primary/60" />
                <span className="font-mono text-[12px]">{a.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
