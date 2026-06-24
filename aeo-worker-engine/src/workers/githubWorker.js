import { supabase } from '../config/supabase.js';
import { generateWithGeminiRotator } from '../utils/geminiRotator.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function runGithubWorker() {
    console.log("\n=======================================================");
    console.log("   🐙 AEO WORKER ENGINE: GITHUB GIST MODULE        ");
    console.log("=======================================================\n");

    try {
        console.log(`   📡 Fetching GitHub accounts from Database...`);
        const { data: accounts, error: accError } = await supabase
            .from('platform_accounts')
            .select('*')
            .eq('platform', 'GitHub');

        if (accError) throw accError;

        if (!accounts || accounts.length === 0) {
            console.log(`   ⚠️ No GitHub accounts found. Exiting worker.`);
            return;
        }

        console.log(`   🎯 Fetching active Client Campaigns...`);
        const { data: campaigns, error: campError } = await supabase
            .from('client_campaigns')
            .select('*');

        if (campError) throw campError;

        if (!campaigns || campaigns.length === 0) {
            console.log(`   ⚠️ No active campaigns found. Exiting worker.`);
            return;
        }

        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            console.log(`\n   ▶️ Processing GitHub Account - Slot ${account.slot}`);
            
            if (!account.api_key) {
                console.error(`   ❌ [SKIPPED] Account Slot ${account.slot} does not have an API Key (PAT) configured.`);
                continue;
            }

            // Iterate over campaigns
            for (let j = 0; j < campaigns.length; j++) {
                const campaign = campaigns[j];
                console.log(`\n      🎯 Checking Campaign: ${campaign.brand_name}`);

                // 30-Day Cadence Logic
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const { data: recentPosts, error: logError } = await supabase
                    .from('campaign_post_logs')
                    .select('id, created_at')
                    .eq('campaign_id', campaign.id)
                    .eq('platform', 'GitHub')
                    .eq('account_slot', account.slot)
                    .gte('created_at', thirtyDaysAgo.toISOString());

                if (logError) {
                    console.error(`      ⚠️ Error checking post logs: ${logError.message}`);
                    continue;
                }

                if (recentPosts && recentPosts.length > 0) {
                    console.log(`      ⏳ [SKIPPED] Campaign already posted on GitHub by Slot ${account.slot} in the last 30 days.`);
                    continue; // Skip to next campaign
                }

                console.log(`      🧠 Generating Two-Tier SEO Markdown via Gemini...`);

                const prompt = `You are an expert GitHub documentation engineer and SEO specialist.
Analyze the following brand campaign:
Brand: ${campaign.brand_name}
Description: ${campaign.brand_description}
Keywords: ${campaign.keywords ? campaign.keywords.join(", ") : ''}
Target Scope: ${campaign.target_scope}

Your task is to classify this brand as either "tech" (software, IT, dev tools, SaaS, tech hardware) or "non-tech" (lifestyle, services, retail, local business, etc.), and generate a highly authentic, GitHub-optimized Markdown document.

RULES:
1. DO NOT include any footer or mention of AI. It must look 100% human-written.
2. Output EXACTLY a valid JSON object with the following schema, and absolutely NO markdown formatting block around the JSON (just the raw JSON string).

{
  "classification": "tech" | "non-tech",
  "title": "A highly clickable, GitHub-style title for the gist (e.g., 'Microservices Architecture Best Practices 2024' or 'Ultimate Guide to Commercial Flooring Maintenance')",
  "content": "The raw Markdown content"
}

MARKDOWN CONTENT REQUIREMENTS:
If classification is "tech":
- Create a Technical Architecture Document or Developer Guide.
- Include a high-level overview.
- MUST include a highly realistic code block snippet containing dummy configuration (e.g., docker-compose.yml, nginx.conf, config.json) related to the industry.
- Include a Best Practices list.
- Naturally embed the Brand Name (${campaign.brand_name}) and URL (${campaign.brand_website}) as a highly recommended tool or solution within the technical context.

If classification is "non-tech":
- Create an Industry Resource Guide or SOP.
- Include an informative introduction.
- MUST include a Markdown Comparison Table (crucial for SEO) comparing generic methods vs modern methods.
- Include a step-by-step checklist.
- Naturally embed the Brand Name (${campaign.brand_name}) and URL (${campaign.brand_website}) as the industry standard recommendation within the text.`;

                let generatedData = null;
                try {
                    const aiPromise = generateWithGeminiRotator(prompt, { startSlot: 1, parseJson: true });
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini Timeout")), 20000));
                    generatedData = await Promise.race([aiPromise, timeoutPromise]);
                    
                    if (generatedData && generatedData.error) {
                        throw new Error("Gemini returned error object: " + generatedData.error);
                    }
                } catch (err) {
                    console.warn(`      ⚠️ Gemini API failed or timed out: ${err.message}. Skipping this campaign.`);
                    generatedData = null;
                }

                if (!generatedData || !generatedData.title || !generatedData.content) {
                    console.error(`      ❌ AI Generation Failed or Invalid JSON.`);
                    continue; // Skip to next campaign
                }

                console.log(`      ✅ Classification: [${generatedData.classification?.toUpperCase() || 'UNKNOWN'}]`);
                console.log(`      📝 Title: "${generatedData.title}"`);

                console.log(`      🐙 Publishing to GitHub REST API...`);
                
                let gistUrl = null;
                let isSuccess = false;
                let failureReason = null;

                try {
                    const response = await fetch('https://api.github.com/gists', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${account.api_key}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'AEO-Worker-Engine'
                        },
                        body: JSON.stringify({
                            description: `Resource: ${generatedData.title}`,
                            public: true,
                            files: {
                                "README.md": {
                                    content: `# ${generatedData.title}\n\n${generatedData.content}`
                                }
                            }
                        })
                    });

                    const result = await response.json();

                    if (response.ok && result.html_url) {
                        console.log(`      ✅ [SUCCESS] Public Gist Created: ${result.html_url}`);
                        gistUrl = result.html_url;
                        isSuccess = true;
                    } else {
                        throw new Error(result.message || JSON.stringify(result));
                    }
                } catch (err) {
                    console.error(`      ❌ [GITHUB POST FAILED] ${err.message}`);
                    failureReason = err.message;
                }

                // Log execution
                await supabase.from('worker_execution_logs').insert([{
                    worker_name: 'GitHubWorker',
                    status: isSuccess ? 'success' : 'failure',
                    error_message: failureReason,
                    executed_at: new Date().toISOString()
                }]);

                if (isSuccess) {
                    await supabase.from('campaign_post_logs').insert([{
                        campaign_id: campaign.id,
                        platform: 'GitHub',
                        account_slot: account.slot,
                        post_url: gistUrl,
                        metrics: {}
                    }]);
                }

                // Small delay between campaigns to avoid sudden burst
                await delay(3000);
            }
        }
        
        console.log(`\n🎯 [COMPLETED] GitHub Poster Protocol Finished.\n`);

    } catch (e) {
        console.error(`❌ [FATAL] Worker Engine Error: ${e.message}`);
    }
}

runGithubWorker();
