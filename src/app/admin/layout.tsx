"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bot, Fingerprint, KeyRound, Bell, Menu, X, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { name: "Platform Accounts", href: "/admin/platform-accounts", icon: Fingerprint },
  { name: "AI Keys Vault", href: "/admin/ai-keys", icon: KeyRound },
  { name: "Alerts & Notifications", href: "/admin/alerts", icon: Bell },
  { name: "Campaigns", href: "/admin/campaigns", icon: Megaphone },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-indigo-400" />
          <span className="font-bold text-lg text-white">AEO Admin</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(!isMobileOpen)}>
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-300 ease-in-out
        md:sticky md:top-0 h-screen md:translate-x-0
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-6 hidden md:flex flex-col items-center justify-center border-b border-slate-800 space-y-3">
            <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 shadow-inner">
              <Bot className="w-8 h-8 text-indigo-400" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold tracking-tight text-white">AEO Core Admin</h1>
              <p className="text-xs text-slate-400 mt-1">Control Center</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                    ${isActive 
                      ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shadow-sm" 
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />
                  <span className="font-medium text-sm">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-x-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-32 bg-indigo-500/5 blur-[100px] -z-10" />
        <main className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto min-h-screen">
          {children}
        </main>
      </div>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </div>
  );
}
