"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  ChartNoAxesCombined,
  FileText,
  History,
  Home,
  PhoneCall,
  Settings,
  UserRoundPlus,
  UsersRound
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/dashboard/agents", label: "Agents", icon: BrainCircuit },
  { href: "/dashboard/calls", label: "Calls", icon: PhoneCall },
  { href: "/dashboard/knowledge", label: "Knowledge", icon: FileText },
  { href: "/dashboard/memory", label: "Memory", icon: History },
  { href: "/dashboard/leads", label: "Leads", icon: UsersRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children, email }: { children: React.ReactNode; email: string }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ChartNoAxesCombined />
          </div>
          <div className="leading-tight">
            <div className="font-semibold">Vaani AI Voice</div>
            <div className="text-xs text-muted-foreground">Voice agent ops</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-4">
          <div className="flex items-center gap-3 rounded-md bg-secondary p-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-background">
              <UserRoundPlus />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{email}</div>
              <div className="text-xs text-muted-foreground">Workspace owner</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ChartNoAxesCombined />
            </div>
            <span className="font-semibold">Vaani</span>
          </Link>
          <div className="hidden text-sm text-muted-foreground lg:block">Low-latency AI voice infrastructure</div>
          <Link href="/dashboard/agents/new" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            New agent
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
