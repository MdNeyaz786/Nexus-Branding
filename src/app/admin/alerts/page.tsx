import { Metadata } from "next";
import { AlertsForm } from "@/components/admin/AlertsForm";
import { Bell } from "lucide-react";
import { getSystemConfig } from "@/app/actions/admin";

export const metadata: Metadata = {
  title: "Alerts & Notifications | AEO Admin",
};

export default async function AlertsPage() {
  const existingConfig = await getSystemConfig();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
          <Bell className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Alerts & Notifications</h2>
          <p className="text-sm text-slate-400">Configure Telegram Bot for automated cookie expiry and error alerts.</p>
        </div>
      </div>
      
      <div className="bg-slate-900 border border-slate-800 shadow-xl rounded-xl p-6 relative overflow-hidden">
        <AlertsForm existingConfig={existingConfig} />
      </div>
    </div>
  );
}
