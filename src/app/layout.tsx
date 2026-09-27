import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Memory Court",
  description:
    "Verification, contradiction detection and provenance for persistent AI-agent memory (GBrain). Researcher and skeptic review every claim before it is remembered.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full bg-zinc-950 antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full bg-zinc-950 font-sans text-zinc-200">{children}</body>
    </html>
  );
}
