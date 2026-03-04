"use client";

import { Suspense } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Note: Using manual form submission to avoid NextAuth signIn() callbackUrl issues
// with multi-origin access (localhost vs Tailscale hostname)

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/board";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Construct full callback URL with current origin
    const fullCallbackUrl = new URL(callbackUrl, window.location.origin).href;

    // Fetch CSRF token from NextAuth (required for Credentials callback)
    const csrfRes = await fetch("/api/auth/csrf", {
      cache: "no-store",
      credentials: "include",
    });
    const csrf = await csrfRes.json().catch(() => null);
    const csrfToken = csrf?.csrfToken;

    // NextAuth expects URL-encoded form posts for CSRF-protected endpoints.
    const body = new URLSearchParams();
    body.set("email", email);
    body.set("password", password);
    if (csrfToken) body.set("csrfToken", csrfToken);
    body.set("callbackUrl", fullCallbackUrl);
    body.set("json", "true");

    const response = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      credentials: "include",
      redirect: "manual", // We'll handle redirect manually to preserve URL
    });

    setLoading(false);

    // NextAuth often responds with a redirect (302/303) on success.
    // With `redirect: "manual"`, that redirect won't be followed automatically.
    if (response.ok || (response.status >= 300 && response.status < 400)) {
      window.location.href = fullCallbackUrl;
      return;
    }

    // Error responses are not guaranteed to be JSON (and `response.json()` can throw).
    try {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        setError(data?.error || "Invalid email or password");
      } else {
        const text = (await response.text()).trim();
        setError(text || "Invalid email or password");
      }
    } catch {
      setError("Invalid email or password");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="admin@houston.local"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 bg-card rounded-lg border shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Houston</h1>
          <p className="text-muted-foreground">Mission Control</p>
        </div>
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
