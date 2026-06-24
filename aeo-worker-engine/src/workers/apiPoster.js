import { supabase } from "../config/supabase.js";
import { generateWithGeminiRotator } from "../utils/geminiRotator.js";

/**
 * Executes the 3-day cadence API posting logic for Dev.to
 */
export async function runApiPosterWorker() {
  console.log(`\n=======================================================`);
  console.log(`   🚀 [API POSTER] Starting Dev.to Article Campaign   `);
  console.log(`=======================================================`);

  try {
    // 1. Fetch active campaigns
    const { data: campaigns, error: campaignErr } = await supabase
      .from('client_campaigns')
      .select('*');

    if (campaignErr) throw campaignErr;
    if (!campaigns || campaigns.length === 0) {
      console.log(`ℹ️ No active campaigns found. Exiting.`);
      return;
    }

    // 2. Fetch Dev.to accounts
    const { data: devToAccounts, error: accErr } = await supabase
      .from('platform_accounts')
      .select('*')
      .eq('platform', 'Dev.to')
      .not('api_key', 'is', null);

    if (accErr) throw accErr;
    if (!devToAccounts || devToAccounts.length === 0) {
      console.log(`ℹ️ No Dev.to accounts with API keys found. Exiting.`);
      return;
    }

    // GLOBAL 24H RATE LIMITER
    const { data: recentPosts } = await supabase
      .from('campaign_post_logs')
      .select('account_slot')
      .eq('platform', 'Dev.to')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const exhaustedSlots = new Set((recentPosts || []).map(p => p.account_slot));
    if (exhaustedSlots.size > 0) {
        console.log(`   🕒 Rate Limiter: Accounts ${Array.from(exhaustedSlots).join(', ')} have already posted today and will be resting.`);
    }

    let availableAccounts = devToAccounts.filter(acc => !exhaustedSlots.has(acc.slot));

    // Iterate through campaigns
    for (const campaign of campaigns) {
      console.log(`\n▶️ Checking Campaign: ${campaign.brand_name || campaign.id}`);

      const campaignStartDate = new Date(campaign.created_at);
      const daysSinceStart = (Date.now() - campaignStartDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceStart > 30) {
        console.log(`   🛑 Campaign has expired (Started ${daysSinceStart.toFixed(1)} days ago). 1 month limit reached.`);
        continue;
      }

      // WEEKLY QUOTA LOGIC
      let maxWeeklyPosts = 10;
      if (campaign.target_scope === 'local') maxWeeklyPosts = 3;
      else if (campaign.target_scope === 'regional') maxWeeklyPosts = 7;

      const { data: recentLogs, error: logErr } = await supabase
        .from('campaign_post_logs')
        .select('account_slot')
        .eq('campaign_id', campaign.id)
        .eq('platform', 'Dev.to')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (logErr) {
        console.error(`❌ Error fetching logs for campaign ${campaign.id}:`, logErr.message);
        continue;
      }

      const usedSlotsThisWeek = new Set((recentLogs || []).map(l => l.account_slot));
      const remainingPostsNeeded = maxWeeklyPosts - usedSlotsThisWeek.size;

      if (remainingPostsNeeded <= 0) {
          console.log(`   ⏳ Campaign reached its weekly quota of ${maxWeeklyPosts} posts. Skipping.`);
          continue;
      }

      const validAccountsForThisCampaign = availableAccounts.filter(acc => !usedSlotsThisWeek.has(acc.slot));

      if (validAccountsForThisCampaign.length === 0) {
          console.log(`   ⚠️ No valid accounts available for this campaign today. Skipping.`);
          continue;
      }

      console.log(`   ✅ Campaign needs ${remainingPostsNeeded} more posts this week! Proceeding.`);

      const accountsNeeded = Math.min(remainingPostsNeeded, validAccountsForThisCampaign.length);
      const allocatedAccounts = validAccountsForThisCampaign.slice(0, accountsNeeded);
      
      // Remove them from the global available pool for the rest of this run
      availableAccounts = availableAccounts.filter(acc => !allocatedAccounts.some(a => a.slot === acc.slot));

      // ==========================================
      // STEP 1: TOPIC GENERATION (Start at Slot 2)
      // ==========================================
      const topicPrompt = `You are a professional content strategist for the Dev.to platform (an audience of software developers).
Brand Name: ${campaign.brand_name}
Brand Website: ${campaign.brand_website}
Target Location: ${campaign.location}
Keywords: ${campaign.keywords ? JSON.stringify(campaign.keywords) : 'N/A'}
Competitors: ${campaign.competitors ? JSON.stringify(campaign.competitors) : 'N/A'}

Your task is to generate exactly ${accountsNeeded} highly engaging, unique, and click-worthy article titles for developers. 
CRITICAL RULE 1: Use the provided Keywords as inspiration, but you are ENCOURAGED to think "out of the box". Generate fresh, innovative topics that go beyond just these 5 keywords as long as they align with the brand.
CRITICAL RULE 2: If the brand's niche (e.g., interior design, flooring, plumbing) is NOT tech-related, you MUST create a clever metaphorical bridge. For example, if the brand sells "flooring", write a title about "The 'Floor' of your Tech Stack: Foundation Principles". If it is tech-related, just write a highly engaging tech title.

STRICT INSTRUCTION: Return ONLY a valid JSON array of strings. Do NOT include markdown formatting or extra text.
Example: ["Title 1", "Title 2"]`;

      console.log(`   🧠 [STEP 1] Generating ${accountsNeeded} topics using AI (Starting at Slot 2)...`);
      const topics = await generateWithGeminiRotator(topicPrompt, { 
        startSlot: 2, 
        parseJson: true, 
        expectedArrayLength: accountsNeeded 
      });

      if (topics.error || !Array.isArray(topics)) {
        console.error(`   ❌ Failed to generate topics:`, topics.error || 'Invalid format');
        continue;
      }

      // ==========================================
      // STEP 2: ARTICLE GENERATION & POSTING
      // ==========================================
      console.log(`   ✍️ [STEP 2] Generating & Posting Articles using Assigned Account Slots...`);
      
      for (let i = 0; i < allocatedAccounts.length; i++) {
        const account = allocatedAccounts[i];
        const assignedTopic = topics[i];

        console.log(`\n      📝 Account Slot ${account.slot} processing topic: "${assignedTopic}"`);

        const articlePrompt = `You are an expert technical writer for the Dev.to developer community. Write a comprehensive, highly engaging article based on this title: "${assignedTopic}".

CRITICAL REQUIREMENTS:
1. You MUST naturally mention the exact Brand Name ("${campaign.brand_name}") within the text.
2. You MUST embed the Brand URL (${campaign.brand_website}) into the text organically, typically anchored to the brand name or a relevant keyword.
3. If the brand is non-tech (e.g., physical flooring), use the brand as a clever analogy for software development (e.g., "Just as ${campaign.brand_name} provides a solid foundation for physical spaces, your database provides..."). Make it look like a helpful resource or organic mention, NOT a spammy ad.

Return the final article in Markdown format. Do NOT include the title as a Markdown header (it will be passed separately).`;

        const articleContent = await generateWithGeminiRotator(articlePrompt, {
          startSlot: account.slot, // Each account uses its own slot, with fallback!
          parseJson: false
        });

        if (articleContent.error) {
           console.error(`      ❌ Failed to generate article for Slot ${account.slot}. Skipping post.`);
           continue;
        }

        // POST TO DEV.TO API
        console.log(`      🌐 Posting to Dev.to API for Slot ${account.slot}...`);
        
        try {
          const devToResponse = await fetch("https://dev.to/api/articles", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": account.api_key
            },
            body: JSON.stringify({
              article: {
                title: assignedTopic,
                body_markdown: articleContent,
                published: true, // Auto-publish
                tags: ["webdev", "tutorial", "programming"] // Default tags, can be generated too
              }
            })
          });

          if (!devToResponse.ok) {
            const errRes = await devToResponse.text();
            throw new Error(`Dev.to API Error: ${devToResponse.status} - ${errRes}`);
          }

          const devToData = await devToResponse.json();
          console.log(`      🎉 Successfully posted! URL: ${devToData.url}`);

          // LOG SUCCESS TO SUPABASE
          await supabase.from('campaign_post_logs').insert({
            campaign_id: campaign.id,
            platform: 'Dev.to',
            account_slot: account.slot,
            post_url: devToData.url
          });

        } catch (postErr) {
          console.error(`      ❌ Dev.to Post Failed for Slot ${account.slot}:`, postErr.message);
          // Log failure to worker logs
          await supabase.from('worker_execution_logs').insert({
              worker_type: 'Dev.to API Poster',
              platform: 'Dev.to',
              status: 'Failed',
              reason: 'API Post Error',
              details: postErr.message,
              account_slot: account.slot
          });
        }
      } // End of Account Loop
    } // End of Campaign Loop

  } catch (globalErr) {
    console.error(`\n❌ [API POSTER FATAL ERROR]:`, globalErr.message);
  }
}

// If run directly, execute the worker
const isMainModule = import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isMainModule) {
  runApiPosterWorker().then(() => {
    console.log(`\n✅ API Poster execution completed.`);
    process.exit(0);
  });
}
