import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Schibsted_Grotesk({ variable: "--font-display-face", subsets: ["latin"], weight: ["600", "700", "800"] });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "All In Capital Triage",
  description: "Application triage for All In Capital. People decide. The system shows its work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
