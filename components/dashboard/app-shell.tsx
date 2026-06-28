"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BrainCircuit,
  ChartNoAxesCombined,
  FileText,
  History,
  Headphones,
  Home,
  PhoneCall,
  Settings,
  UserRoundPlus,
  UsersRound
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/agents", label: "Agents", icon: BrainCircuit },
  { href: "/dashboard/voice", label: "Voice lab", icon: Headphones },
  { href: "/dashboard/calls", label: "Call history", icon: PhoneCall },
  { href: "/dashboard/knowledge", label: "Knowledge", icon: FileText },
  { href: "/dashboard/memory", label: "Learning queue", icon: History },
  { href: "/dashboard/leads", label: "Leads", icon: UsersRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Business call desk",
  "/dashboard/agents": "Voice agents",
  "/dashboard/voice": "Voice lab",
  "/dashboard/calls": "Call history",
  "/dashboard/knowledge": "Knowledge",
  "/dashboard/memory": "Learning queue",
  "/dashboard/leads": "Leads",
  "/dashboard/settings": "Settings"
};

function getPageTitle(pathname: string) {
  const match = Object.entries(pageTitles)
    .filter(([href]) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href)))
    .sort((a, b) => b[0].length - a[0].length)[0];

  return match?.[1] || "Business call desk";
}

export function AppShell({ children, email }: { children: React.ReactNode; email: string }) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <div className="min-h-screen bg-secondary/45">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ChartNoAxesCombined />
          </div>
          <div className="leading-tight">
            <div className="font-semibold">Vaani Voice</div>
            <div className="text-xs text-muted-foreground">Calls, leads, learning</div>
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
              <div className="text-xs text-muted-foreground">Demo workspace</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-3 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ChartNoAxesCombined />
            </div>
            <span className="font-semibold">Vaani</span>
          </Link>
          <div className="hidden leading-tight lg:block">
            <div className="text-sm font-medium">{pageTitle}</div>
            <div className="text-xs text-muted-foreground">Answer calls, capture leads, and improve every week</div>
          </div>
          <Link href="/dashboard/agents/new" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-panel">
            Add agent
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
