import type { Metadata } from "next";
import { connection } from "next/server";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Sign in · LINE OA Webchat" };

export default async function LoginPage() {
  // Render per request so the proxy's CSP nonce is applied to the page's scripts.
  await connection();
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-brand-wash px-4">
      {/* Decorative gradient blobs. */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-16 size-96 rounded-full bg-brand opacity-15 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-3xl bg-white/90 p-8 shadow-xl shadow-brand/10 ring-1 ring-brand-soft backdrop-blur">
        <span className="inline-flex rounded-bubble bg-brand-soft px-3 py-1 text-xs font-medium text-brand">Admin console</span>
        <h1 className="mt-4 text-2xl font-semibold">
          <span className="text-brand-gradient">LINE OA</span> Webchat
        </h1>
        <p className="mb-6 mt-1 text-sm font-light text-muted">Sign in to read and reply to messages.</p>
        <LoginForm />
      </div>
    </main>
  );
}
