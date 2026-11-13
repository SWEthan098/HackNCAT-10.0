import type { Metadata } from "next";
import { Familjen_Grotesk, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import { AuthHashHandler } from "@/components/auth/AuthHashHandler";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

// Cobalt theme faces (Hallmark). Routed through tokens in globals.css.
const display = Familjen_Grotesk({ variable: "--font-familjen", subsets: ["latin"], weight: ["500", "600"] });
const body = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "HackNCAT", template: "%s | HackNCAT" },
  description: "HackNCAT 10.0 starter platform: Next.js, Supabase and FastAPI.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <AuthHashHandler />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
