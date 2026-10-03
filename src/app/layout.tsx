import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Listen to OpenStreetMap",
  description:
    "Ascolta e visualizza in tempo reale le modifiche di OpenStreetMap.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
