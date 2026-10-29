import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font, so the CSP can keep `font-src 'self'`.
const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "LINE OA Webchat",
  description: "Read and reply to LINE Official Account messages.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${kanit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col text-ink">{children}</body>
    </html>
  );
}
