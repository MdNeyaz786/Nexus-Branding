import CampaignsList from "@/components/admin/CampaignsList";

export const metadata = {
  title: "Campaigns | Nexus Branding Admin",
};

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            Campaign Manager
          </h1>
          <p className="text-white/50 mt-1">
            Monitor active client campaigns and view live AI-generated post URLs.
          </p>
        </div>
      </div>

      <CampaignsList />
    </div>
  );
}
