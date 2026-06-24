import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nexus Branding | AI-Recommended Brand",
  description: "Make Your Brand an AI-Recommended Brand.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-50 selection:bg-indigo-500/30">
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
