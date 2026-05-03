import React from "react";
import { Link, useLocation } from "wouter";
import { Target, ListTodo, Briefcase, Plus, BarChart3, Bot, CalendarCheck, ClipboardCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_GROUPS = [
  {
    label: "Operating System",
    items: [
      { href: "/", label: "Dashboard", icon: BarChart3 },
      { href: "/pipeline", label: "Pipeline", icon: Target },
      { href: "/actions", label: "Actions", icon: ListTodo },
    ],
  },
  {
    label: "Review Cadence",
    items: [
      { href: "/weekly-review", label: "Weekly Review", icon: CalendarCheck },
      { href: "/diligence-review", label: "Diligence Review", icon: ClipboardCheck },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/copilot", label: "AI Copilot", icon: Bot },
    ],
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <aside className="glass-shell w-full md:w-60 shrink-0 flex flex-col md:sticky md:top-0 md:h-screen">

        {/* Brand mark */}
        <div className="px-4 pt-5 pb-4 border-b border-sidebar-border/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 shrink-0 shadow-sm">
              <Briefcase size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[11px] tracking-widest text-sidebar-foreground/90 uppercase truncate leading-tight">
                Growth OS
              </p>
              <p className="text-[9px] text-sidebar-foreground/35 uppercase tracking-widest font-mono leading-tight mt-0.5">
                Confidential · Corp Dev
              </p>
            </div>
          </div>
          <Link href="/targets/new">
            <Button className="w-full justify-start gap-2 h-8 text-[11px] font-mono uppercase tracking-wider rounded-lg" size="sm">
              <Plus size={13} />
              New Opportunity
            </Button>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            return (
              <div key={group.label}>
                <p className="nav-section-label mb-1.5">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.href ||
                      (item.href !== "/" && location.startsWith(item.href));
                    return (
                      <Link key={item.href} href={item.href}>
                        <div className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                          isActive
                            ? "bg-primary/12 text-primary"
                            : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/5"
                        }`}>
                          {isActive && (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r-full" />
                          )}
                          <Icon size={14} className="shrink-0 ml-0.5" />
                          <span className="truncate">{item.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Data */}
          <div>
            <p className="nav-section-label mb-1.5">Data</p>
            <div className="space-y-0.5">
              <Link href="/import">
                <div className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                  location === "/import"
                    ? "bg-primary/12 text-primary"
                    : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/5"
                }`}>
                  {location === "/import" && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r-full" />
                  )}
                  <Upload size={14} className="shrink-0 ml-0.5" />
                  <span className="truncate">Import Targets</span>
                </div>
              </Link>
            </div>
          </div>
        </nav>

        {/* Status footer */}
        <div className="px-4 py-3 border-t border-sidebar-border/40 mt-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] text-sidebar-foreground/35 font-mono">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Live
            </div>
            <span className="text-[9px] font-mono text-sidebar-foreground/25 uppercase tracking-widest">
              M&amp;A
            </span>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
