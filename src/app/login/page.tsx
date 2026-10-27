import type { Metadata } from "next";
import { connection } from "next/server";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Sign in · LINE OA Webchat" };

export default async function LoginPage() {
  // Render per request so the proxy's CSP nonce is applied to the page's scripts.
  await connection();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200">
        <h1 className="text-xl font-semibold text-zinc-900">LINE OA Webchat</h1>
        <p className="mb-6 mt-1 text-sm text-zinc-500">Sign in to read and reply to messages.</p>
        <LoginForm />
      </div>
    </main>
  );
}
