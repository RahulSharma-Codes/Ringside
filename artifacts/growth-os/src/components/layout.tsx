import React from "react";
import { Link, useLocation } from "wouter";
import { Target, ListTodo, Briefcase, Plus, BarChart3, Bot, CalendarCheck, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: BarChart3 },
    { href: "/pipeline", label: "Pipeline", icon: Target },
    { href: "/actions", label: "Actions Tracker", icon: ListTodo },
    { href: "/copilot", label: "AI Copilot", icon: Bot },
    { href: "/weekly-review", label: "Weekly Review", icon: CalendarCheck },
    { href: "/diligence-review", label: "Diligence Review", icon: ClipboardCheck },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <aside className="glass-shell w-full md:w-60 shrink-0 flex flex-col md:sticky md:top-0 md:h-screen">
        {/* Brand mark */}
        <div className="px-4 py-4 border-b border-sidebar-border/60 flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 border border-primary/20 shrink-0">
            <Briefcase size={15} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[11px] tracking-widest text-sidebar-foreground uppercase truncate">
              Growth OS
            </p>
            <p className="text-[9px] text-sidebar-foreground/40 uppercase tracking-widest font-mono">
              Confidential
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <div className="mb-3">
            <Link href="/targets/new">
              <Button className="w-full justify-start gap-2 h-8 text-xs font-mono uppercase tracking-wider" size="sm">
                <Plus size={14} />
                New Opportunity
              </Button>
            </Link>
          </div>

          <p className="px-2 mb-2 text-[9px] font-mono uppercase tracking-widest text-sidebar-foreground/35">
            Navigate
          </p>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/5"
                }`}>
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-full" />
                  )}
                  <Icon size={15} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Status footer */}
        <div className="px-4 py-3 border-t border-sidebar-border/50 mt-auto">
          <div className="flex items-center gap-2 text-[10px] text-sidebar-foreground/40 font-mono">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Live
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
