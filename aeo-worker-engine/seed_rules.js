import { supabase } from './src/config/supabase.js';

async function seedRules() {
  console.log("🔍 Fetching 'Goals Floors' campaign ID...");
  const { data: campaign, error: campErr } = await supabase
    .from('client_campaigns')
    .select('id')
    .eq('brand_name', 'Goals Floors')
    .single();
    
  if (campErr) {
    return console.log("❌ Error finding campaign:", campErr.message);
  }
  
  const campaign_id = campaign.id;
  
  const rules = [
    { campaign_id, platform: 'Quora', actions_per_account: 3 },
    { campaign_id, platform: 'Reddit', actions_per_account: 2 },
    { campaign_id, platform: 'X', actions_per_account: 3 }
  ];
  
  console.log("⏳ Inserting Platform Rules...");
  const { error: insErr } = await supabase.from('campaign_platform_rules').insert(rules);
  
  if (insErr) {
    console.log("❌ Error inserting rules:", insErr.message);
  } else {
    console.log("✅ Successfully inserted rules for Goals Floors: Quora(3), Reddit(2), X(3)!");
  }
}

seedRules();
