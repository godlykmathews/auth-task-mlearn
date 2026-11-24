import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/logout-button";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  const { user } = current;
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="dashboard-layout">
      <header className="dashboard-header">
        <Brand href="/dashboard" />
        <LogoutButton />
      </header>
      <main className="dashboard-main">
        <section className="dashboard-card" aria-labelledby="dashboard-title">
          <h1 id="dashboard-title">Welcome, {firstName}.</h1>
          <p>{user.email}</p>
        </section>
      </main>
    </div>
  );
}
