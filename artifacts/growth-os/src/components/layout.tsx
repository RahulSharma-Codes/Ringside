import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, Target, ListTodo, Briefcase, Plus, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: BarChart3 },
    { href: "/pipeline", label: "Pipeline", icon: Target },
    { href: "/actions", label: "Actions Tracker", icon: ListTodo },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <aside className="w-full md:w-64 border-r border-border bg-sidebar shrink-0 flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className="bg-primary/20 p-2 rounded text-primary">
            <Briefcase size={20} />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-tight">INORGANIC GROWTH OS</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">Confidential</p>
          </div>
        </div>

        <nav className="p-4 space-y-1 flex-1">
          <div className="mb-4">
            <Link href="/targets/new">
              <Button className="w-full justify-start gap-2" variant="default" size="sm">
                <Plus size={16} />
                New Opportunity
              </Button>
            </Link>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 px-2">Navigation</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/");
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm font-medium transition-colors cursor-pointer ${
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
            System Online
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
