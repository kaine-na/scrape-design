import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scrape Design",
  description: "Generate AI-ready DESIGN.md files from public website URLs."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
