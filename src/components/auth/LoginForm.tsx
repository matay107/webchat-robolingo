"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const ERROR_MESSAGES: Record<number, string> = {
  401: "Incorrect password.",
  429: "Too many attempts. Try again in a few minutes.",
};

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) return router.replace("/");
      setError(ERROR_MESSAGES[response.status] ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPassword("");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          maxLength={1024}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-base font-normal outline-none transition focus:border-brand focus:ring-4 focus:ring-brand-soft"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-dark">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || password.length === 0}
        className="rounded-bubble bg-brand-gradient py-3 font-medium text-white shadow-lg shadow-brand/25 transition hover:brightness-105 disabled:opacity-50 disabled:shadow-none"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
