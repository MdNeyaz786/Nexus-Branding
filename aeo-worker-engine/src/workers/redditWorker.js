import { supabase } from "../config/supabase.js";
import { generateWithGeminiRotator } from "../utils/geminiRotator.js";
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

// Add stealth plugin to avoid detection
chromium.use(stealthPlugin());

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runRedditPosterWorker() {
  console.log(`\n=======================================================`);
  console.log(`   📢 AEO WORKER ENGINE: REDDIT COMMENTER MODULE       `);
  console.log(`=======================================================`);

  try {
    console.log(`\n📡 Fetching Reddit accounts from Vault...`);
    const { data: redditAccounts, error: accErr } = await supabase
      .from('platform_accounts')
      .select('*')
      .eq('platform', 'Reddit')
      .not('cookie_json', 'is', null);

    if (accErr) throw accErr;
    if (!redditAccounts || redditAccounts.length === 0) {
      console.log(`ℹ️ No Reddit accounts found. Exiting.`);
      return;
    }

    console.log(`\n-------------------------------------------------------`);
    for (const account of redditAccounts) {
      console.log(`🤖 [SLOT ${account.slot}] Processing Reddit Account`);

      // 1. Check daily post limit (Reddit is stricter, max 2 per day per account)
      const maxDailyPosts = 2;
      const { data: recentLogs, error: logErr } = await supabase
        .from('campaign_post_logs')
        .select('id')
        .eq('account_slot', account.slot)
        .eq('platform', 'Reddit')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const postsToday = recentLogs ? recentLogs.length : 0;
      console.log(`   ✅ [ACCOUNT STATUS] Slot ${account.slot} usage: ${postsToday}/${maxDailyPosts} comments today. Available: ${maxDailyPosts - postsToday}`);

      if (postsToday >= maxDailyPosts) {
        console.log(`   ⏳ [DAILY LIMIT ENFORCED] Slot ${account.slot} has already made ${maxDailyPosts} Reddit comments in the last 24h. Sleeping.`);
        continue; // Skip to next account
      }

      // 2. Fetch pending Reddit tasks from queue
      console.log(`   🔍 Checking target_url_queue for pending Reddit URLs for Slot ${account.slot}...`);
      const { data: tasks, error: taskErr } = await supabase
        .from('target_url_queue')
        .select('*')
        .eq('platform', 'Reddit')
        .eq('status', 'pending')
        .limit(maxDailyPosts - postsToday);

      if (taskErr) throw taskErr;
      if (!tasks || tasks.length === 0) {
        console.log(`   ℹ️ No pending Reddit URLs in queue for Slot ${account.slot}. Moving to next account.`);
        continue;
      }

      console.log(`   🚀 Proceeding to process ${tasks.length} Reddit tasks for Slot ${account.slot}...`);

      // 3. Launch browser for this account
      let browser = null;
      try {
        const launchOptions = { headless: false };

        if (account.proxy_ip) {
            launchOptions.proxy = { server: account.proxy_ip };
            console.log(`   🛡️ Proxy Active for Slot ${account.slot}: ${account.proxy_ip}`);
        } else {
            console.log(`   ⚠️ [WARNING] No proxy found for Slot ${account.slot}. ALLOWED due to Local Testing Exception!`);
        }

        browser = await chromium.launch(launchOptions);
        const context = await browser.newContext();

        // Cookie Injection
        let cookies = typeof account.cookie_json === 'string' ? JSON.parse(account.cookie_json) : account.cookie_json;
        if (Array.isArray(cookies)) {
           const cleanCookies = cookies.map(c => {
               const validSameSite = ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax';
               return {
                  name: c.name,
                  value: c.value,
                  domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
                  path: c.path || '/',
                  secure: validSameSite === 'None' ? true : (c.secure || false),
                  httpOnly: c.httpOnly || false,
                  sameSite: validSameSite
               };
           });
           await context.addCookies(cleanCookies);
           console.log(`   🍪 Successfully injected Reddit Cookies.`);
        }
        
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        const page = await context.newPage();

        // 4. Process each task for this account
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            console.log(`\n   -----------------------------------------`);
            console.log(`   ▶️ Executing Task ${i+1}/${tasks.length}: ${task.target_url}`);

            const { data: campaign } = await supabase
                .from('client_campaigns')
                .select('*')
                .eq('id', task.campaign_id)
                .single();

            if (!campaign) {
                console.log(`   ❌ Campaign not found for task ${task.id}. Skipping.`);
                continue;
            }

            console.log(`   🧠 Generating stealth comment via Gemini...`);
            
            // GENERATE COMMENT
            const commentPrompt = `Act as a normal, active Reddit user participating in a discussion related to this brand's niche.
Brand Name: ${campaign.brand_name}
Brand Website: ${campaign.brand_website}
Brand Description: ${campaign.description}

Write a natural, casual, and helpful Reddit comment (2-4 sentences). 
CRITICAL RULE 1: Speak casually. Lowercase some letters, use conversational phrasing.
CRITICAL RULE 2: Organically mention the brand or recommend it, but don't sound like a marketer. Just a user sharing a tip.
CRITICAL RULE 3: Output ONLY the raw comment text. No markdown, no quotes, no extra greetings.`;

            let commentText = null;
            try {
               commentText = await generateWithGeminiRotator(commentPrompt, { startSlot: 2 });
               if (commentText && commentText.error) throw new Error(commentText.error);
            } catch (e) {
               console.error(`   ❌ AI Network Error:`, e.message);
               continue;
            }

            console.log(`   📝 Generated Comment: "${commentText.substring(0, 50)}..."`);
            
            console.log(`   🌍 Navigating to Target Reddit URL...`);
            await page.goto(task.target_url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await delay(5000);

            try {
                console.log(`   🎯 Finding the Comment Box (Handling Lazy-Loading)...`);
                
                // Reddit UI trick: Scroll repeatedly to trigger lazy loading
                let foundCommentBox = false;
                for(let scrollAttempt = 0; scrollAttempt < 15; scrollAttempt++) {
                    const actionBtn = page.locator('shreddit-comment-action-row button:has-text("Join the conversation"), button:has-text("Reply"), button[aria-label="Add a comment"], button[aria-label="Comment"]').first();
                    const actionCount = await actionBtn.count();
                    
                    if (actionCount > 0) {
                        await actionBtn.click({ force: true }).catch(() => {});
                        await delay(1000);
                        foundCommentBox = true;
                        break;
                    }
                    
                    const composerBox = page.locator('shreddit-composer div[contenteditable="true"], div[contenteditable="true"][data-lexical-editor="true"]').first();
                    if (await composerBox.count() > 0) {
                        foundCommentBox = true;
                        break;
                    }
                    
                    await page.evaluate(() => window.scrollBy(0, 800));
                    await delay(1000);
                }

                // Exact locator based on DevTools screenshot
                const commentBox = page.locator('shreddit-composer div[contenteditable="true"][data-lexical-editor="true"]').first();
                
                await delay(2000);
                
                await commentBox.waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
                const isAttached = await commentBox.count() > 0;
                
                if (!isAttached) {
                    console.error(`   ❌ [TASK FAILED] Comment box not attached to DOM. The post might be locked or account is restricted.`);
                    throw new Error("Comment box not found or not interactable.");
                } else {
                    console.log(`   📋 Injecting comment...`);
                    
                    // 1. Scroll into view via Playwright
                    await commentBox.scrollIntoViewIfNeeded().catch(()=>{});
                    await delay(1000);
                    
                    // 2. Playwright native Force Click to ensure OS-level focus (crucial for typing)
                    await commentBox.click({ force: true }).catch(()=>{});
                    await delay(1000);
                    
                    // 3. Fallback JS focus just in case
                    await commentBox.evaluate(node => node.focus()).catch(()=>{});
                    await delay(500);
                    
                    // 4. Type the text natively. Because we used native click above, focus is secure.
                    // This registers properly in React/Lexical state.
                    await page.keyboard.type(commentText, { delay: 10 });
                    await delay(2000);

                    console.log(`   🚀 Clicking 'Comment/Submit' natively...`);
                    // Exact submit button locator from DevTools screenshot
                    const postButton = page.locator('shreddit-composer button#comment-composer-submit-button').first();
                    
                    // Use force click on the exact button
                    await postButton.click({ force: true }).catch(async () => {
                       // Fallback
                       await postButton.evaluate(btn => btn.click()).catch(()=>{});
                    });
                }

                await delay(5000);
                
                // Screenshot for verification
                await page.screenshot({ path: `reddit_success_slot_${account.slot}_proof.png` }).catch(() => {});
                console.log(`   📸 Captured screenshot of successful post!`);
                console.log(`   ✅ Successfully Posted Reddit Comment!`);

                // SUCCESS LOGGING
                await supabase.from('target_url_queue').update({ status: 'completed' }).eq('id', task.id);
                console.log(`   [DEBUG] Inserting log with campaign_id: ${campaign.id}, platform: Reddit`);
                
                const { error: logErr } = await supabase.from('campaign_post_logs').insert({
                     campaign_id: campaign.id,
                     platform: 'Reddit',
                     account_slot: account.slot,
                     post_url: task.target_url
                });

                if (logErr) throw new Error("Failed to log post to campaign_post_logs: " + logErr.message);
                console.log(`   ✅ DB Logging Successful!`);

            } catch (postErr) {
                console.error(`   ❌ [TASK FAILED]`, postErr.message);
                
                await supabase.from('target_url_queue').update({ status: 'failed' }).eq('id', task.id);
                
                await supabase.from('worker_execution_logs').insert({
                    worker_type: 'Reddit Browser Poster',
                    platform: 'Reddit',
                    status: 'Failed',
                    reason: 'Task Failed',
                    details: postErr.message,
                    account_slot: account.slot
                }).catch(()=>{});
            }
        } // End of task loop

        if (browser) {
            await browser.close();
            console.log(`   🧹 Browser cleanly terminated.`);
        }
      } catch (e) {
          console.error(`   ❌ Browser Launch/Execution Error:`, e);
          if (browser) await browser.close();
      }
    }

    console.log(`\n🎯 [COMPLETED] Reddit Commenter Protocol Finished.`);
  } catch (globalErr) {
    console.error(`\n❌ [REDDIT WORKER FATAL ERROR]:`, globalErr.message);
  }
}

const isMainModule = import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isMainModule) {
  runRedditPosterWorker().then(() => {
    process.exit(0);
  });
}
