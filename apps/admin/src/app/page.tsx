// File: src/app/page.tsx
// Purpose: Admin login placeholder
// Depends on: None

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold text-primary">TrustEngine Admin</h1>
      <p className="mt-4 text-lg text-muted-foreground">Internal dashboard</p>
      <div className="mt-8 w-full max-w-sm space-y-4">
        <input
          type="email"
          placeholder="Admin email"
          className="w-full rounded-md border px-4 py-2"
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full rounded-md border px-4 py-2"
        />
        <button className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Sign In
        </button>
      </div>
    </main>
  );
}
