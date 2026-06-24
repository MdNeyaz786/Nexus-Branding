import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
chromium.use(stealth());

import { supabase } from '../config/supabase.js';
import { generateWithGeminiRotator } from '../utils/geminiRotator.js';

/**
 * Enterprise Quora Auto-Commenter Worker
 * Consumes from target_url_queue. Implements Strict Proxy Logic,
 * the Clipboard Paste Trick, First-Comment targeting, 
 * Account Daily Quota (3 per day), and Campaign Weekly Quota.
 */

const delay = (ms) => new Promise(res => setTimeout(res, ms));

export async function runQuoraCommentWorker() {
  console.log("\n=======================================================");
  console.log("   📢 AEO WORKER ENGINE: QUORA COMMENTER MODULE        ");
  console.log("=======================================================\n");

  try {
    // 1. Fetch Quora Accounts
    console.log(`📡 Fetching Quora accounts from Vault...`);
    const { data: quoraAccounts, error: accErr } = await supabase
      .from('platform_accounts')
      .select('*')
      .eq('platform', 'Quora');

    if (accErr) throw accErr;
    if (!quoraAccounts || quoraAccounts.length === 0) {
      console.log(`ℹ️ No Quora accounts found. Exiting.`);
      return;
    }

    // Process each account slot
    for (const account of quoraAccounts) {
      console.log(`\n-------------------------------------------------------`);
      console.log(`🤖 [SLOT ${account.slot}] Processing Quora Account`);

      // ==========================================
      // EDGE CASE 1: ACCOUNT 24H QUOTA (3 COMMENTS/DAY)
      // ==========================================
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPosts, error: limitErr } = await supabase
        .from('campaign_post_logs')
        .select('id')
        .eq('platform', 'Quora')
        .eq('account_slot', account.slot)
        .gte('created_at', twentyFourHoursAgo);

      const dailyUsage = recentPosts ? recentPosts.length : 0;
      const availableDailyPosts = 3 - dailyUsage;

      if (availableDailyPosts <= 0) {
         console.log(`   ⏳ [DAILY LIMIT ENFORCED] Slot ${account.slot} has already made 3 comments in the last 24h. Sleeping.`);
         continue;
      } else {
         console.log(`   ✅ [ACCOUNT STATUS] Slot ${account.slot} usage: ${dailyUsage}/3 comments today. Available: ${availableDailyPosts}`);
      }

      // ==========================================
      // QUEUE FETCHING
      // ==========================================
      console.log(`   🔍 Checking target_url_queue for pending Quora URLs for Slot ${account.slot}...`);
      const { data: queueItems, error: queueErr } = await supabase
        .from('target_url_queue')
        .select('*')
        .eq('platform', 'Quora')
        .eq('status', 'pending')
        .eq('assigned_account_slot', account.slot)
        .order('id', { ascending: true }); 

      if (queueErr || !queueItems || queueItems.length === 0) {
        console.log(`   📭 Queue is empty for Slot ${account.slot}. Moving to next account.`);
        continue;
      }

      // ==========================================
      // FETCH URLS FOR ACCOUNT
      // ==========================================
      const tasksToProcess = [];
      for (const task of queueItems) {
         if (tasksToProcess.length >= availableDailyPosts) break; // Reached account's daily capacity
         if (!task.campaign_id) continue;

         const { data: campaign } = await supabase
            .from('client_campaigns')
            .select('*')
            .eq('id', task.campaign_id)
            .single();

         if (!campaign) continue;

         // No Campaign-level limit for Quora (unlike Medium). 
         // It's a volume game (3 per account per day).
         task.campaignData = campaign;
         tasksToProcess.push(task);
      }

      if (tasksToProcess.length === 0) {
         console.log(`   ℹ️ No tasks available for Slot ${account.slot} that fit Campaign Weekly Quotas.`);
         continue;
      }

      console.log(`   🚀 Proceeding to process ${tasksToProcess.length} tasks for Slot ${account.slot}...`);

      // ==========================================
      // STRICT PROXY LOGIC
      // ==========================================
      let proxyConfig = null;
      if (account.proxy_ip && account.proxy_ip.trim() !== '') {
        let proxyStr = account.proxy_ip.trim();
        if (!proxyStr.startsWith('http')) proxyStr = `http://${proxyStr}`;
        proxyConfig = { server: proxyStr };
        console.log(`   🛡️ [PROXY ENFORCED] Launching safely through proxy.`);
      } else {
        if (account.slot === 1) {
          console.log(`   ⚠️ [WARNING] No proxy found for Slot 1. ALLOWED due to Local Testing Exception!`);
        } else {
          console.log(`   🛑 [SKIPPED] No proxy found for Slot ${account.slot}. Skipping to prevent mass bans.`);
          continue; // Skip account entirely
        }
      }

      // ==========================================
      // PLAYWRIGHT AUTOMATION BATCH
      // ==========================================
      let browser = null;
      try {
        const launchOptions = {
          headless: false, 
          args: ['--disable-blink-features=AutomationControlled']
        };
        if (proxyConfig) launchOptions.proxy = proxyConfig;

        browser = await chromium.launch(launchOptions);
        const context = await browser.newContext({
          permissions: ['clipboard-read', 'clipboard-write'],
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        let cookies = typeof account.cookie_json === 'string' ? JSON.parse(account.cookie_json) : account.cookie_json;
        if (Array.isArray(cookies)) {
           const cleanCookies = cookies.map(c => ({
              name: c.name, value: c.value, domain: c.domain, path: c.path,
              secure: c.secure, httpOnly: c.httpOnly, expires: c.expires || c.expirationDate
           }));
           await context.addCookies(cleanCookies);
        }

        const page = await context.newPage();

        for (let i = 0; i < tasksToProcess.length; i++) {
            const task = tasksToProcess[i];
            const campaign = task.campaignData;

            console.log(`\n   -----------------------------------------`);
            console.log(`   ▶️ Executing Task ${i+1}/${tasksToProcess.length}: ${task.target_url}`);

            // GENERATE COMMENT
            const commentPrompt = `Act as a normal Quora user reading an answer related to this brand's niche.
Brand Name: ${campaign.brand_name}
Brand Website: ${campaign.brand_website}
Brand Description: ${campaign.brand_description}

Write a 2-3 sentence comment adding genuine value to the topic, and casually recommend the brand.
CRITICAL RULES:
1. Do NOT sound like an advertisement. Sound like a helpful human.
2. Mentions should be very natural, e.g., "I've been using ${campaign.brand_name} for this and it's been great..."
3. Return ONLY the plain text comment. No quotes, no markdown, no headings.`;

            console.log(`   🧠 Generating stealth comment via Gemini...`);
            const commentText = await generateWithGeminiRotator(commentPrompt, { startSlot: 2, parseJson: false });

            if (!commentText || commentText.error) {
               console.error(`   ❌ AI Generation Failed.`);
               await markTaskFailed(task.id, 'AI Generation Failed');
               continue;
            }
            console.log(`   📝 Generated Comment: "${commentText.substring(0, 50)}..."`);

            // POST COMMENT
            try {
                console.log(`   🌍 Navigating to Target URL...`);
                await page.goto(task.target_url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await delay(5000);

                console.log(`   🎯 Finding the FIRST Comment Icon...`);
                const commentButton = page.locator('button[aria-label*="comment" i], div[role="button"][aria-label*="comment" i], button[aria-label*="Reply" i], div[role="button"][aria-label*="Reply" i], .puppeteer_test_reply_button').first();
                
                const isVisible = await commentButton.isVisible({ timeout: 5000 }).catch(()=>false);
                if (!isVisible) throw new Error("Could not find the comment button on the first answer.");

                await commentButton.scrollIntoViewIfNeeded();
                await delay(1000);
                await commentButton.click();
                console.log(`   ✅ Clicked First Answer's Comment Icon.`);
                await delay(2000);

                console.log(`   📋 Injecting comment into Clipboard and Pasting...`);
                const editorLocator = page.locator('.quill-editor, [contenteditable="true"]').first();
                if (await editorLocator.isVisible()) {
                   await editorLocator.click();
                   await delay(500);
                }

                await page.evaluate((text) => navigator.clipboard.writeText(text), commentText);
                await delay(500);
                
                const isMac = process.platform === 'darwin';
                await page.keyboard.press(isMac ? 'Meta+V' : 'Control+V');
                await delay(2000);

                const editorContent = await editorLocator.innerText();
                if (!editorContent || editorContent.trim().length < 5) {
                    console.log(`   ⚠️ Clipboard paste seemed to fail. Falling back to typing...`);
                    await editorLocator.click();
                    await page.keyboard.type(commentText, { delay: 30 });
                    await delay(1000);
                } else {
                    console.log(`   ✅ Comment pasted naturally into Quill Editor.`);
                }

                console.log(`   🚀 Clicking 'Post'...`);
                const postButton = page.getByRole('button', { name: 'Post', exact: true }).last(); 
                if (await postButton.isVisible()) {
                   await postButton.click({ force: true });
                } else {
                   const replySubmitBtn = page.getByRole('button', { name: 'Reply', exact: true }).last();
                   await replySubmitBtn.click({ force: true });
                }

                await delay(4000);
                console.log(`   ✅ Successfully Posted Comment!`);

                // SUCCESS LOGGING
                await supabase.from('target_url_queue').update({ status: 'completed' }).eq('id', task.id);
                await supabase.from('campaign_post_logs').insert({
                     campaign_id: campaign.id,
                     platform: 'Quora',
                     account_slot: account.slot,
                     post_url: task.target_url
                });

            } catch (innerErr) {
                console.error(`   ❌ [TASK FAILED] ${innerErr.message}`);
                await markTaskFailed(task.id, innerErr.message);
            }
        }

      } catch (browserErr) {
        console.error(`   ❌ [BROWSER FATAL] ${browserErr.message}`);
      } finally {
        if (browser) {
           await browser.close();
           console.log(`   🧹 Browser cleanly terminated.`);
        }
      }
    }
    console.log("\n🎯 [COMPLETED] Quora Commenter Protocol Finished.");
  } catch (error) {
    console.error(`\n❌ [FATAL ERROR] Quora Automation Aborted: -> ${error.message}`);
  }
}

async function markTaskFailed(taskId, reason) {
   await supabase.from('target_url_queue').update({ status: 'failed', details: reason }).eq('id', taskId);
}

runQuoraCommentWorker();
