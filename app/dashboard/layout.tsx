import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <AppShell email={user.email}>{children}</AppShell>;
}
