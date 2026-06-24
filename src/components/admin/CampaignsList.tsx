"use client";

import { useEffect, useState } from "react";
import { getCampaigns, getCampaignLogs } from "@/app/actions/admin";

interface Campaign {
  id: string;
  brand_name: string;
  target_scope: string;
  location: string;
  created_at: string;
}

interface Log {
  id: number;
  platform: string;
  account_slot: number;
  post_url: string;
  created_at: string;
}

export default function CampaignsList() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    async function loadCampaigns() {
      const res = await getCampaigns();
      if (res.success && res.data) {
        setCampaigns(res.data);
      }
      setLoading(false);
    }
    loadCampaigns();
  }, []);

  const handleViewLogs = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setLogsLoading(true);
    const res = await getCampaignLogs(campaign.id);
    if (res.success && res.data) {
      setLogs(res.data);
    }
    setLogsLoading(false);
  };

  const getScopeBadge = (scope: string) => {
    switch (scope) {
      case "local": return <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/50">Local</span>;
      case "regional": return <span className="px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/50">Regional</span>;
      case "global": return <span className="px-2 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">Global</span>;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map((camp) => (
          <div key={camp.id} className="relative group p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/50 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
            
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold text-white/90 truncate pr-4">{camp.brand_name}</h3>
                {getScopeBadge(camp.target_scope)}
              </div>
              
              <p className="text-sm text-white/50 mb-6 truncate">
                {camp.location || "No location specified"}
              </p>

              <button
                onClick={() => handleViewLogs(camp)}
                className="w-full py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-emerald-400 text-sm font-medium transition-colors border border-white/5 hover:border-emerald-500/30 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                View Post Logs
              </button>
            </div>
          </div>
        ))}

        {campaigns.length === 0 && (
          <div className="col-span-full p-12 text-center rounded-2xl bg-white/5 border border-white/10 border-dashed">
            <p className="text-white/60">No campaigns found. Campaigns submitted via the main site will appear here.</p>
          </div>
        )}
      </div>

      {/* Logs Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-3xl bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedCampaign.brand_name}</h2>
                <p className="text-sm text-white/50">Post History & Logs</p>
              </div>
              <button 
                onClick={() => setSelectedCampaign(null)}
                className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {logsLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                </div>
              ) : logs.length > 0 ? (
                <div className="space-y-4">
                  {logs.map(log => (
                    <div key={log.id} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                            log.platform === 'Dev.to' ? 'bg-black text-white border border-white/20' : 'bg-white text-black'
                          }`}>
                            {log.platform}
                          </span>
                          <span className="text-xs text-white/40">Slot {log.account_slot}</span>
                        </div>
                        <span className="text-xs text-white/40">
                          {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <a 
                        href={log.post_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline break-all"
                      >
                        {log.post_url}
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-white/40">
                  <p>No posts generated for this campaign yet.</p>
                  <p className="text-sm mt-2">The background worker will automatically post when due.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
