import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Houston — Mission Control",
  description: "OpenClaw agent task scheduling and monitoring",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
