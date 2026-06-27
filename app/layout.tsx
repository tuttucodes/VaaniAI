import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vaani AI Voice",
  description: "Low-latency, multilingual AI phone agents for real business calls."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
