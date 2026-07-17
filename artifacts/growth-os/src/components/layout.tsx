import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  Target, ListTodo, Briefcase, Plus, BarChart3, Bot, CalendarCheck,
  ClipboardCheck, Upload, ChevronDown, PanelLeftClose, PanelLeftOpen, Menu,
  FolderOpen, LineChart, ShieldCheck, Lightbulb, LogOut, Sun, Moon, KeyRound,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NotificationBell } from "@/components/notification-bell";
import { CommandPalette } from "@/components/command-palette";
import { AnimatedPage } from "@/components/animated-page";
import { useAuth } from "@/contexts/auth-context";
import { customFetch } from "@workspace/api-client-react";

// ─── Theme toggle ────────────────────────────────────────────────────────────

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted ? (theme ?? resolvedTheme) === "dark" : true;
  const toggle = () => setTheme(isDark ? "light" : "dark");

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            onClick={toggle}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent/60 transition-all duration-150"
            aria-label="Toggle theme"
          >
            {isDark ? <Moon size={13} /> : <Sun size={13} />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          <span className="font-mono text-[11px]">{isDark ? "Switch to light" : "Switch to dark"}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 text-[10px] font-mono text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors rounded-lg px-2 py-1.5 hover:bg-sidebar-accent/50"
      aria-label="Toggle theme"
    >
      {isDark ? <Moon size={11} /> : <Sun size={11} />}
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}

function MobileThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted ? (theme ?? resolvedTheme) === "dark" : true;
  const toggle = () => setTheme(isDark ? "light" : "dark");

  return (
    <button
      onClick={toggle}
      className="w-8 h-8 flex items-center justify-center rounded-xl text-sidebar-foreground/60 hover:text-foreground hover:bg-sidebar-accent/50 transition-all duration-150"
      aria-label="Toggle theme"
    >
      {isDark ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

type NavItem = { href: string; label: string; icon: React.ElementType; group: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/",                 label: "Dashboard",         icon: BarChart3,      group: "Operating System" },
  { href: "/pipeline",         label: "Pipeline",          icon: Target,         group: "Operating System" },
  { href: "/actions",          label: "Actions",           icon: ListTodo,       group: "Operating System" },
  { href: "/weekly-review",    label: "Weekly Review",     icon: CalendarCheck,  group: "Review Cadence"   },
  { href: "/diligence-review", label: "Diligence Review",  icon: ClipboardCheck, group: "Review Cadence"   },
  { href: "/document-review",  label: "Document Review",   icon: FolderOpen,     group: "Review Cadence"   },
  { href: "/analytics",        label: "Analytics",         icon: LineChart,      group: "Intelligence"     },
  { href: "/copilot",          label: "AI Copilot",        icon: Bot,            group: "Intelligence"     },
  { href: "/doctrine",         label: "Doctrine",          icon: Lightbulb,      group: "Intelligence"     },
  { href: "/import",           label: "Import Targets",    icon: Upload,         group: "Data"             },
  { href: "/admin",            label: "Admin",             icon: ShieldCheck,    group: "Admin"            },
];

const NAV_GROUPS = ["Operating System", "Review Cadence", "Intelligence", "Data", "Admin"];

function isActive(href: string, location: string) {
  if (href === "/") return location === "/";
  return location.startsWith(href);
}

const AUTH_TOKEN_KEY = "ig_os_auth_token";

function handleLogout() {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.location.reload();
}

// ─── Sidebar Contents (shared between desktop + mobile drawer) ──────────────

function SidebarNav({
  location,
  collapsed,
  openGroups,
  toggleGroup,
  onNavigate,
  onOpenPalette,
  isAdmin,
  overdueCount,
}: {
  location: string;
  collapsed: boolean;
  openGroups: Set<string>;
  toggleGroup: (g: string) => void;
  onNavigate?: () => void;
  onOpenPalette: () => void;
  isAdmin: boolean;
  overdueCount: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const visibleItems = NAV_ITEMS.filter((i) => i.group !== "Admin" || isAdmin);
  const visibleGroups = NAV_GROUPS.filter((g) => g !== "Admin" || isAdmin);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Brand */}
      <div className={`shrink-0 ${collapsed ? "px-2 pt-4 pb-3" : "px-4 pt-5 pb-4"}`}>
        {collapsed ? (
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 border border-primary/25">
              <Briefcase size={16} className="text-primary" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 shrink-0">
                <Briefcase size={16} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[13px] tracking-tight text-sidebar-foreground/95 truncate leading-tight">Ringside</p>
                <p className="text-[9px] text-sidebar-foreground/35 font-mono leading-tight mt-0.5 truncate">M&A Intelligence Platform</p>
              </div>
            </div>
            <Link href="/targets/new" onClick={onNavigate}>
              <Button className="w-full justify-center gap-2 h-8 text-[11px] font-sans font-medium rounded-xl" size="sm">
                <Plus size={13} /> New Opportunity
              </Button>
            </Link>
          </>
        )}
      </div>

      {/* Search trigger */}
      {!collapsed && (
        <div className="px-3 pb-2 shrink-0">
          <button
            onClick={onOpenPalette}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-sidebar-border/50 bg-sidebar-accent/30 hover:bg-sidebar-accent/60 text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-all duration-150 group"
          >
            <Search size={11} className="shrink-0" />
            <span className="flex-1 text-left text-[11px] font-sans truncate">Search…</span>
            <kbd className="hidden sm:flex items-center gap-0.5 text-[9px] font-mono text-sidebar-foreground/25 group-hover:text-sidebar-foreground/45 transition-colors bg-sidebar-accent/80 px-1 py-0.5 rounded-md">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto py-2 ${collapsed ? "px-1.5" : "px-2.5"}`}>
        {collapsed ? (
          /* Icon-only mode with tooltips */
          <div className="space-y-0.5">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenPalette}
                  className="relative flex items-center justify-center w-9 h-9 rounded-xl mx-auto transition-all duration-150 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                >
                  <Search size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                <span className="font-mono text-[11px]">Search (⌘K)</span>
              </TooltipContent>
            </Tooltip>
            <div className="my-1.5 mx-2 h-px bg-sidebar-border/40" />
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href, location);
              const showBadge = item.href === "/actions" && overdueCount > 0;
              return (
                <Tooltip key={item.href} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link href={item.href} onClick={onNavigate}>
                      <div className={`relative flex items-center justify-center w-9 h-9 rounded-xl mx-auto transition-all duration-150 cursor-pointer ${
                        active
                          ? "bg-primary/15 text-primary shadow-sm"
                          : "text-sidebar-foreground/45 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                      }`}>
                        {active && (
                          <motion.span
                            layoutId="sidebar-active-collapsed"
                            className="absolute inset-0 rounded-xl bg-primary/15"
                            transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 35 }}
                          />
                        )}
                        <Icon size={14} className="relative z-10" />
                        {showBadge && (
                          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 rounded-full bg-destructive text-white text-[8px] font-mono font-bold flex items-center justify-center px-0.5 z-20">
                            {overdueCount > 9 ? "9+" : overdueCount}
                          </span>
                        )}
                      </div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    <span className="font-mono text-[11px]">{item.label}</span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          /* Grouped accordion mode with liquid pill indicator */
          <div className="space-y-0.5">
            {visibleGroups.map((group) => {
              const items = visibleItems.filter((i) => i.group === group);
              const isOpen = openGroups.has(group);
              const groupHasActive = items.some((i) => isActive(i.href, location));
              return (
                <div key={group} className="mb-1">
                  <button
                    onClick={() => toggleGroup(group)}
                    className={`w-full flex items-center justify-between px-2 py-1 rounded-lg transition-colors group text-[9px] font-mono uppercase tracking-widest ${
                      groupHasActive
                        ? "text-primary/55 hover:text-primary/75"
                        : "text-sidebar-foreground/25 hover:text-sidebar-foreground/45"
                    }`}
                  >
                    <span>{group}</span>
                    <ChevronDown
                      size={9}
                      className={`transition-transform duration-200 ease-in-out ${isOpen ? "" : "-rotate-90"}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="space-y-0.5 py-0.5">
                      {items.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href, location);
                        const showBadge = item.href === "/actions" && overdueCount > 0;
                        return (
                          <Link key={item.href} href={item.href} onClick={onNavigate}>
                            <div className={`relative flex items-center gap-2.5 px-2.5 py-[6px] rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer overflow-hidden ${
                              active
                                ? "text-primary font-semibold"
                                : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                            }`}>
                              {active && (
                                <motion.span
                                  layoutId="sidebar-active"
                                  className="absolute inset-0 rounded-xl bg-primary/12"
                                  transition={
                                    shouldReduceMotion
                                      ? { duration: 0 }
                                      : { type: "spring", stiffness: 400, damping: 35 }
                                  }
                                />
                              )}
                              {active && (
                                <motion.span
                                  layoutId="sidebar-active-bar"
                                  className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r-full"
                                  transition={
                                    shouldReduceMotion
                                      ? { duration: 0 }
                                      : { type: "spring", stiffness: 400, damping: 35 }
                                  }
                                />
                              )}
                              <Icon size={14} className="shrink-0 ml-0.5 relative z-10" />
                              <span className="truncate flex-1 relative z-10">{item.label}</span>
                              {showBadge && (
                                <span className="min-w-[18px] h-4 rounded-full bg-destructive text-white text-[9px] font-mono font-bold flex items-center justify-center px-1 shrink-0 relative z-10">
                                  {overdueCount > 9 ? "9+" : overdueCount}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className={`border-t border-sidebar-border/30 shrink-0 ${collapsed ? "px-2 py-2.5" : "px-3 py-2.5"}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5 mb-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <ThemeToggle collapsed />
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Link href="/settings/password">
                  <button className="w-8 h-8 flex items-center justify-center rounded-xl text-sidebar-foreground/30 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-all duration-150">
                    <KeyRound size={12} />
                  </button>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                <span className="font-mono text-[11px]">Change password</span>
              </TooltipContent>
            </Tooltip>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-sidebar-foreground/30 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-all duration-150"
                >
                  <LogOut size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                <span className="font-mono text-[11px]">Logout</span>
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 text-[10px] text-sidebar-foreground/35 font-mono">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Live
            </div>
            <div className="flex items-center gap-0.5">
              <ThemeToggle collapsed={false} />
              <Link href="/settings/password">
                <button
                  className="flex items-center gap-1 text-[10px] font-mono text-sidebar-foreground/30 hover:text-sidebar-foreground/60 transition-colors rounded-lg px-1.5 py-1 hover:bg-sidebar-accent/50"
                  title="Change password"
                >
                  <KeyRound size={11} />
                </button>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-[10px] font-mono text-sidebar-foreground/30 hover:text-sidebar-foreground/60 transition-colors rounded-lg px-1.5 py-1 hover:bg-sidebar-accent/50"
                title="Logout"
              >
                <LogOut size={11} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

interface CommandCenterAction {
  id: number;
  dueDate: string | null;
  status: string;
  owner: string | null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { isAdmin, user } = useAuth();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(NAV_GROUPS));

  const toggleGroup = (g: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: myActions } = useQuery({
    queryKey: ["sidebar-overdue-count", user?.email],
    queryFn: () => customFetch<CommandCenterAction[]>("/api/actions/command-center?mine=true"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    select: (data) => data.filter((a) => a.status !== "Completed" && a.dueDate && a.dueDate < todayStr).length,
  });

  const overdueCount = myActions ?? 0;
  const navProps = { location, openGroups, toggleGroup, isAdmin, overdueCount, onOpenPalette: () => setPaletteOpen(true) };

  return (
    <div className="h-screen overflow-hidden bg-background flex font-sans">

      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside
        className={`relative hidden md:flex flex-col glass-shell shrink-0 h-full transition-all duration-200 ease-in-out ${
          collapsed ? "w-14" : "w-[220px]"
        }`}
      >
        <SidebarNav {...navProps} collapsed={collapsed} />

        {/* Collapse toggle — floats at right edge */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="absolute -right-3 top-20 z-10 w-6 h-6 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-150"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <PanelLeftOpen size={11} />
            : <PanelLeftClose size={11} />
          }
        </button>
      </aside>

      {/* ── Mobile: fixed topbar + Sheet drawer ─────────────────── */}
      <div className="md:hidden fixed inset-x-0 top-0 z-50 h-12 flex items-center justify-between px-3 glass-shell border-b border-sidebar-border/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Briefcase size={13} className="text-primary" />
          </div>
          <span className="font-bold text-[12px] tracking-tight text-foreground/90">Ringside</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MobileThemeToggle />
          <NotificationBell />
          <Link href="/targets/new">
            <Button size="sm" className="h-7 px-2.5 rounded-xl font-sans text-[11px] gap-1.5 font-semibold">
              <Plus size={11} /> New
            </Button>
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="w-8 h-8 flex items-center justify-center rounded-xl text-sidebar-foreground/60 hover:text-foreground hover:bg-sidebar-accent/50 transition-all duration-150">
                <Menu size={17} />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="p-0 w-[260px] glass-shell border-r border-sidebar-border/70 [&>button]:hidden"
            >
              <SidebarNav
                {...navProps}
                collapsed={false}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* ── Main content area ────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-auto pt-12 md:pt-0">
        <AnimatedPage layoutKey={location}>
          {children}
        </AnimatedPage>
      </main>

      {/* ── Command palette ─────────────────────────────────────── */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
