import { Metadata } from "next";
import { PlatformAccountsForm } from "@/components/admin/PlatformAccountsForm";
import { Fingerprint } from "lucide-react";
import { getPlatformAccountsStatus } from "@/app/actions/admin";

export const metadata: Metadata = {
  title: "Platform Accounts | AEO Admin",
};

export default async function PlatformAccountsPage() {
  const existingPlatformAccounts = await getPlatformAccountsStatus();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
          <Fingerprint className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Platform Accounts</h2>
          <p className="text-sm text-slate-400">Manage proxy IPs, cookies, and API keys for platforms.</p>
        </div>
      </div>
      
      <div className="bg-slate-900 border border-slate-800 shadow-xl rounded-xl p-6 relative overflow-hidden">
        <PlatformAccountsForm existingAccounts={existingPlatformAccounts} />
      </div>
    </div>
  );
}
