import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { absolute: "Kairos Red Team" },
  description: "Attack a fictional company's AI assistant from your phone and see how Kairos responds.",
};

/** Public audience page: no login, no auth provider. */
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
