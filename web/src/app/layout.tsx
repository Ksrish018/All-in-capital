import type { Metadata } from "next";
import { Fraunces, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { DemoBanner } from "@/components/DemoBanner";
import { isDemo } from "@/lib/demo";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// Dark theme headlines.
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
// Light theme headlines.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "All In Capital Triage",
  description: "Application triage for All In Capital. People decide. The system shows its work.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${instrument.variable} ${fraunces.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {(await isDemo()) && <DemoBanner />}
        {children}
      </body>
    </html>
  );
}
