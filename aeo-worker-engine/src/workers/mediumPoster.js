import { supabase } from "../config/supabase.js";
import { generateWithGeminiRotator } from "../utils/geminiRotator.js";
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { marked } from "marked";

// Add stealth plugin to avoid detection
chromium.use(stealthPlugin());

/**
 * Executes the 7-day cadence Browser posting logic for Medium.com
 */
export async function runMediumPosterWorker() {
  console.log(`\n=======================================================`);
  console.log(`   🚀 [MEDIUM POSTER] Starting Medium Article Campaign   `);
  console.log(`=======================================================`);

  try {
    // 1. Fetch active campaigns
    const { data: campaigns, error: campaignErr } = await supabase
      .from('client_campaigns')
      .select('*');

    if (campaignErr) throw campaignErr;
    if (!campaigns || campaigns.length === 0) {
      console.log(`ℹ️ No campaigns found in client_campaigns. Exiting.`);
      return;
    }

    // 2. Fetch Medium accounts
    const { data: mediumAccounts, error: accErr } = await supabase
      .from('platform_accounts')
      .select('*')
      .eq('platform', 'Medium')
      .not('cookie_json', 'is', null); // Must have cookies

    if (accErr) throw accErr;
    if (!mediumAccounts || mediumAccounts.length === 0) {
      console.log(`ℹ️ No Medium accounts with cookies found. Exiting.`);
      return;
    }

    // 2.5 GLOBAL RATE LIMITER: Fetch all Medium posts in the last 24 hours
    const { data: recentPosts } = await supabase
      .from('campaign_post_logs')
      .select('account_slot')
      .eq('platform', 'Medium')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    // Create a Set of account slots that have already posted in the last 24 hours
    const exhaustedSlots = new Set((recentPosts || []).map(p => p.account_slot));
    
    if (exhaustedSlots.size > 0) {
        console.log(`   🕒 Rate Limiter: Accounts ${Array.from(exhaustedSlots).join(', ')} have already posted today and will be resting.`);
    }

    // Filter out accounts that have already posted today
    const availableMediumAccounts = mediumAccounts.filter(acc => !exhaustedSlots.has(acc.slot));

    if (availableMediumAccounts.length === 0) {
        console.log(`   🛑 All Medium accounts are on cooldown (already posted in last 24h). Exiting.`);
        return;
    }

    // Iterate through campaigns
    for (const campaign of campaigns) {
      console.log(`\n▶️ Checking Campaign: ${campaign.brand_name || campaign.id}`);

      // Check if campaign is older than 1 month (30 days)
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
        .eq('platform', 'Medium')
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

      const validAccountsForThisCampaign = availableMediumAccounts.filter(acc => !usedSlotsThisWeek.has(acc.slot));

      if (validAccountsForThisCampaign.length === 0) {
          console.log(`   ⚠️ No valid accounts available for this campaign today. Skipping.`);
          continue;
      }

      console.log(`   ✅ Campaign needs ${remainingPostsNeeded} more posts this week! Proceeding.`);

      const accountsNeeded = Math.min(remainingPostsNeeded, validAccountsForThisCampaign.length);
      const allocatedAccounts = validAccountsForThisCampaign.slice(0, accountsNeeded);
      
      // Remove them from the global available pool for the rest of this run
      availableMediumAccounts = availableMediumAccounts.filter(acc => !allocatedAccounts.some(a => a.slot === acc.slot));

      // ==========================================
      // STEP 1: TOPIC GENERATION (Start at Slot 2)
      // ==========================================
      const topicPrompt = `You are a professional content strategist for Medium.com readers.
Brand Name: ${campaign.brand_name}
Brand Website: ${campaign.brand_website}
Target Location: ${campaign.location}
Keywords: ${campaign.keywords ? JSON.stringify(campaign.keywords) : 'N/A'}
Competitors: ${campaign.competitors ? JSON.stringify(campaign.competitors) : 'N/A'}

Your task is to generate exactly ${accountsNeeded} highly engaging, unique, and click-worthy article titles for a broad audience.
CRITICAL RULE 1: Use the provided Keywords as inspiration, but you are ENCOURAGED to think "out of the box". Generate fresh, innovative topics that go beyond just these 5 keywords as long as they align with the brand.
CRITICAL RULE 2: Ensure the title represents a high-quality, long-form editorial piece typical of Medium (e.g., Thought leadership, deep dives, comprehensive guides).

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
      console.log(`   ✍️ [STEP 2] Generating & Posting Articles using Browser Automation...`);
      
      for (let i = 0; i < allocatedAccounts.length; i++) {
        const account = allocatedAccounts[i];
        const assignedTopic = topics[i];

        console.log(`\n      📝 Account Slot ${account.slot} processing topic: "${assignedTopic}"`);

        const articlePrompt = `You are an expert editorial writer for Medium.com. Write a comprehensive, highly engaging, and beautifully formatted article based on this title: "${assignedTopic}".

CRITICAL REQUIREMENTS:
1. You MUST naturally mention the exact Brand Name ("${campaign.brand_name}") within the text.
2. You MUST embed the Brand URL (${campaign.brand_website}) into the text organically, typically anchored to the brand name or a relevant keyword.
3. Make it look like a genuinely helpful resource or thought-leadership piece, NOT a spammy ad.

FORMATTING RULES FOR MEDIUM:
- Do NOT use numbered lists (1. 2. 3.).
- Do NOT use nested lists.
- ONLY use H2 (##) or H3 (###) for headings.
- Use standard paragraphs and simple flat bullet points (*) only. This ensures Medium renders it perfectly.

Return the final article in Markdown format. Do NOT include the title as a Markdown header.`;

        const articleContent = await generateWithGeminiRotator(articlePrompt, {
          startSlot: account.slot, // Fallback logic applies
          parseJson: false
        });

        if (articleContent.error) {
           console.error(`      ❌ Failed to generate article for Slot ${account.slot}. Skipping post.`);
           continue;
        }

        // POST TO MEDIUM USING PLAYWRIGHT
        console.log(`      🌐 Launching Headless Browser for Slot ${account.slot}...`);
        
        let browser = null;
        try {
          const launchOptions = {
            headless: true, // Invisible execution for server environment
          };

          // Apply proxy if available
          if (account.proxy_ip) {
            launchOptions.proxy = { server: account.proxy_ip };
            console.log(`         🛡️ Using Proxy: ${account.proxy_ip}`);
          } else {
            console.log(`         ⚠️ No Proxy found. Proceeding with default connection.`);
          }

          browser = await chromium.launch(launchOptions);

          // Need to parse cookies safely
          let parsedCookies = [];
          if (typeof account.cookie_json === 'string') {
              parsedCookies = JSON.parse(account.cookie_json);
          } else {
              parsedCookies = account.cookie_json;
          }

          // Ensure cookies map correctly to Playwright structure
          // Playwright expects url or domain. 
          const playwrightCookies = parsedCookies.map(c => {
             const cookie = {
                 name: c.name,
                 value: c.value,
                 domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
                 path: c.path || '/'
             };
             if (c.secure !== undefined) cookie.secure = c.secure;
             if (c.httpOnly !== undefined) cookie.httpOnly = c.httpOnly;
             // Don't set sameSite or expiration to avoid strict validation errors unless necessary
             return cookie;
          });

          const context = await browser.newContext();
          await context.addCookies(playwrightCookies);

          // Grant clipboard permissions for pasting
          await context.grantPermissions(['clipboard-read', 'clipboard-write']);

          const page = await context.newPage();

          // 1. Navigate directly to New Story
          console.log(`         🔗 Navigating to https://medium.com/new-story`);
          await page.goto("https://medium.com/new-story", { waitUntil: 'domcontentloaded', timeout: 45000 });

          // Basic check if we are logged in
          const titleFieldSelector = '[data-testid="editorTitleInput"]'; // Medium often uses this, or a generic h3
          // We will use keyboard sequence if exact selectors fail, but let's try to focus the title first.
          
          // Wait for editor to load
          await page.waitForTimeout(5000); // Give Medium editor time to initialize

          // Try clicking the Title element directly (usually an h3 with placeholder 'Title')
          console.log(`         ✍️ Typing Title...`);
          try {
             await page.click('h3.graf--title', { timeout: 5000 });
          } catch (e) {
             // Fallback: Click the center of the screen near top
             await page.mouse.click(300, 200);
          }
          
          await page.keyboard.type(assignedTopic, { delay: 50 });
          await page.keyboard.press('Enter');
          
          // We are now in the content block
          console.log(`         📋 Injecting content into Clipboard & Pasting (Rich Text)...`);
          
          // Convert Gemini's Markdown to HTML so Medium parses formatting perfectly
          const htmlContent = marked.parse(articleContent);
          
          // Inject content into system clipboard inside the page context as HTML
          await page.evaluate(async (html) => {
              const blob = new Blob([html], { type: 'text/html' });
              const data = [new ClipboardItem({ 'text/html': blob })];
              await navigator.clipboard.write(data);
          }, htmlContent);

          // Trigger Paste
          await page.keyboard.press('Control+V');
          
          await page.waitForTimeout(3000); // Wait for content to render

          // Click Publish (Top right button)
          console.log(`         🚀 Clicking Publish...`);
          
          // Click the first "Publish" button (nav bar)
          const publishBtn = await page.getByRole('button', { name: 'Publish', exact: true }).first();
          if (publishBtn) {
             await publishBtn.click();
             await page.waitForTimeout(3000);
             
             // The modal has a 'Publish' button (or 'Publish now')
             // Medium recently changed it to just "Publish" again in the modal, or sometimes "Publish now"
             const publishNowBtn = await page.getByRole('button', { name: /^Publish( now)?$/i }).last();
             if (publishNowBtn) {
                 await publishNowBtn.click();
                 console.log(`         ✅ Final Publish confirmed!`);
             } else {
                 throw new Error("Could not find the final 'Publish' confirmation button.");
             }
          } else {
             throw new Error("Could not find the initial 'Publish' button.");
          }

          // Wait for URL to change to the published post
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          
          const finalUrl = page.url();
          console.log(`      🎉 Successfully posted! URL: ${finalUrl}`);

          // LOG SUCCESS TO SUPABASE
          const { error: insertErr } = await supabase.from('campaign_post_logs').insert({
            campaign_id: campaign.id,
            platform: 'Medium',
            account_slot: account.slot,
            post_url: finalUrl
          });

          if (insertErr) throw new Error("Failed to insert log into DB: " + insertErr.message);

        } catch (postErr) {
          console.error(`      ❌ Browser Post Failed for Slot ${account.slot}:`, postErr.message);
          
          // Capture screenshot for debugging
          if (browser) {
              const pages = await browser.contexts()[0].pages();
              if (pages.length > 0) {
                  const errorPage = pages[0];
                  await errorPage.screenshot({ path: `medium_error_slot_${account.slot}.png`, fullPage: true }).catch(() => {});
              }
          }

          // Log failure to worker logs
          await supabase.from('worker_execution_logs').insert({
              worker_type: 'Medium Browser Poster',
              platform: 'Medium',
              status: 'Failed',
              reason: 'Browser Automation Error',
              details: postErr.message,
              account_slot: account.slot
          });
        } finally {
          if (browser) {
            await browser.close();
            console.log(`         🧹 Browser closed for Slot ${account.slot}.`);
          }
        }
      } // End of Account Loop
    } // End of Campaign Loop

  } catch (globalErr) {
    console.error(`\n❌ [MEDIUM POSTER FATAL ERROR]:`, globalErr.message);
  }
}

// If run directly, execute the worker
const isMainModule = import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isMainModule) {
  runMediumPosterWorker().then(() => {
    console.log(`\n✅ Medium Poster execution completed.`);
    process.exit(0);
  });
}
