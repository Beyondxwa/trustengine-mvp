// File: src/app/dashboard/page.tsx
// Purpose: Admin dashboard overview placeholder
// Depends on: None

export default function AdminDashboardPage() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/40 p-4">
        <h2 className="text-lg font-bold">TrustEngine Admin</h2>
        <nav className="mt-4 space-y-2">
          <a href="/dashboard" className="block rounded-md px-3 py-2 hover:bg-muted">
            Overview
          </a>
          <a href="/dashboard/tenants" className="block rounded-md px-3 py-2 hover:bg-muted">
            Tenants
          </a>
          <a href="/dashboard/flags" className="block rounded-md px-3 py-2 hover:bg-muted">
            Flags
          </a>
          <a href="/dashboard/audit" className="block rounded-md px-3 py-2 hover:bg-muted">
            Audit Logs
          </a>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <h1 className="text-3xl font-bold">Admin Overview</h1>
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Total Tenants</p>
            <p className="text-2xl font-bold">0</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Active Users</p>
            <p className="text-2xl font-bold">0</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">MRR</p>
            <p className="text-2xl font-bold">$0</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Open Flags</p>
            <p className="text-2xl font-bold">0</p>
          </div>
        </div>
      </main>
    </div>
  );
}
