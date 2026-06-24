import { supabase } from './src/config/supabase.js';

async function injectTestUrl() {
  console.log("💉 Injecting a test URL into the target_url_queue for Quora...");

  // 1. Get any active campaign
  const { data: campaigns, error: campErr } = await supabase
    .from('client_campaigns')
    .select('id, brand_name')
    .limit(1);

  if (campErr || !campaigns || campaigns.length === 0) {
    console.error("❌ No campaigns found in the database.");
    return;
  }

  const campaign = campaigns[0];
  console.log(`✅ Using Campaign: ${campaign.brand_name} (${campaign.id})`);

  // 2. Insert test URL
  const testUrl = "https://www.quora.com/How-does-AI-work-for-you"; // URL from your screenshot
  
  const { error: insertErr } = await supabase
    .from('target_url_queue')
    .update({ status: 'pending' })
    .eq('target_url', testUrl);

  if (insertErr) {
    console.error("❌ Failed to inject URL:", insertErr.message);
  } else {
    console.log(`✅ Successfully injected URL: ${testUrl}`);
    console.log("🚀 Now you can run: node src/workers/quoraWorker.js");
  }
}

injectTestUrl();
