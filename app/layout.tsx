import type { Metadata } from "next";
import "./globals.css";
import { LayoutShell } from "@/components/dashboard/LayoutShell";

export const metadata: Metadata = {
  title: "Athlete Engine",
  description:
    "App d'entraînement adaptatif multi-sport connectée Garmin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body suppressHydrationWarning>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
