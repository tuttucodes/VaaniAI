import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vaani AI Voice",
  description: "Low-latency AI voice agent platform with LiveKit, Gemini, Supabase, and Vobiz."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
