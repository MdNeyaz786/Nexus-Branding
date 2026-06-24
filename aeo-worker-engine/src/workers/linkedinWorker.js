import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { supabase } from '../config/supabase.js';
import { generateWithGeminiRotator } from '../utils/geminiRotator.js';

chromium.use(stealth());

const delay = (ms) => new Promise(res => setTimeout(res, ms));

export async function runLinkedInPosterWorker() {
  console.log("\n=======================================================");
  console.log("   📢 AEO WORKER ENGINE: LINKEDIN POSTER MODULE        ");
  console.log("=======================================================\n");

  try {
    // 1. Fetch LinkedIn Accounts
    console.log(`📡 Fetching LinkedIn accounts from Vault...`);
    const { data: linkedinAccounts, error: accErr } = await supabase
      .from('platform_accounts')
      .select('*')
      .eq('platform', 'LinkedIn')
      .not('cookie_json', 'is', null);

    if (accErr) throw accErr;
    if (!linkedinAccounts || linkedinAccounts.length === 0) {
      console.log(`ℹ️ No LinkedIn accounts found. Exiting.`);
      return;
    }

    for (const account of linkedinAccounts) {
      console.log(`\n-------------------------------------------------------`);
      console.log(`🤖 [SLOT ${account.slot}] Processing LinkedIn Account`);

      // ==========================================
      // STRICT PROXY LOGIC (Quora Match)
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
      // 24H QUOTA CHECK (2 POSTS/DAY)
      // ==========================================
      const maxDailyPosts = 2;
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPosts, error: limitErr } = await supabase
        .from('campaign_post_logs')
        .select('id')
        .eq('platform', 'LinkedIn')
        .eq('account_slot', account.slot)
        .gte('created_at', twentyFourHoursAgo);

      const dailyUsage = recentPosts ? recentPosts.length : 0;
      const availableDailyPosts = maxDailyPosts - dailyUsage;

      if (availableDailyPosts <= 0) {
         console.log(`   ⏳ [DAILY LIMIT ENFORCED] Slot ${account.slot} has already made ${maxDailyPosts} LinkedIn posts in the last 24h. Sleeping.`);
         continue;
      } else {
         console.log(`   ✅ [ACCOUNT STATUS] Slot ${account.slot} usage: ${dailyUsage}/${maxDailyPosts} posts today. Available: ${availableDailyPosts}`);
      }

      // ==========================================
      // FETCH ALL ACTIVE CAMPAIGNS
      // ==========================================
      const { data: campaigns, error: campErr } = await supabase
        .from('client_campaigns')
        .select('*');

      if (campErr || !campaigns || campaigns.length === 0) {
          console.log(`   ❌ No active campaigns found in client_campaigns. Skipping account.`);
          continue;
      }

      // We will loop to create posts up to the available daily limit
      let browser = null;
      let browserLaunched = false;

      for (let i = 0; i < availableDailyPosts; i++) {
         console.log(`\n   ▶️ Executing Post ${i+1}/${availableDailyPosts} for Slot ${account.slot}`);
         
         // Pick a random campaign
         const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
         console.log(`   🎯 Selected Campaign: ${campaign.brand_name}`);

         // ==========================================
         // GEMINI GENERATION (LINKEDIN POST + PEXELS QUERY)
         // ==========================================
         const prompt = `You are a professional B2B marketing expert and brand ambassador on LinkedIn.
Brand Name: ${campaign.brand_name}
Brand Website: ${campaign.brand_website}
Brand Description: ${campaign.brand_description}

Write a short, engaging, and professional LinkedIn post promoting this brand.
CRITICAL RULES:
1. Keep the text concise and highly impactful (no character limit, but short is better).
2. Generate 2-3 highly relevant hashtags naturally appended at the end of the post.
3. Keep the tone professional yet approachable.
4. Generate a 1-to-2 word aesthetic search query that perfectly represents the brand/industry (e.g. "modern office", "teamwork", "coffee laptop"). This will be used to fetch a background image from Pexels API.

You MUST return ONLY a valid JSON object with EXACTLY these two keys: "linkedin_post_text" and "pexels_query". Do not include markdown formatting.`;

         console.log(`   🧠 Generating stealth LinkedIn Post & Image Query via Gemini...`);
         
         let generatedData = null;
         try {
             const aiPromise = generateWithGeminiRotator(prompt, { startSlot: 2, parseJson: true });
             const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini Timeout")), 20000));
             generatedData = await Promise.race([aiPromise, timeoutPromise]);
             
             // If the rotator caught an error internally and returned an error object
             if (generatedData && generatedData.error) {
                 throw new Error("Gemini returned error object: " + generatedData.error);
             }
         } catch (err) {
             console.warn(`   ⚠️ Gemini API failed or timed out: ${err.message}. Skipping this post.`);
             generatedData = null;
         }

         if (!generatedData || !generatedData.linkedin_post_text || !generatedData.pexels_query) {
             console.error(`   ❌ AI Generation Failed or Invalid JSON.`);
             continue; // Skip this iteration
         }

         console.log(`   📝 Generated Post: "${generatedData.linkedin_post_text.substring(0, 50)}..."`);
         console.log(`   🔎 Pexels Query: "${generatedData.pexels_query}"`);

         // ==========================================
         // PEXELS API FETCH (ARRAY BUFFER)
         // ==========================================
         console.log(`   🔑 Fetching Pexels API Key from system_config (fallback to .env)...`);
         let pexelsApiKey = process.env.PEXELS_API_KEY;
         
         try {
            const { data: sysConfig } = await supabase.from('system_config').select('pexels_api_key').eq('id', 1).single();
            if (sysConfig && sysConfig.pexels_api_key) {
                pexelsApiKey = sysConfig.pexels_api_key;
            }
         } catch(e) { /* ignore */ }

         if (!pexelsApiKey) {
             console.error(`   ❌ [FATAL] PEXELS_API_KEY is missing in both DB and .env! Skipping post.`);
             continue;
         }

         console.log(`   🖼️ Fetching image from Pexels API...`);
         let imageBuffer = null;
         try {
             const pexelsResponse = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(generatedData.pexels_query)}&per_page=1`, {
                 headers: { Authorization: pexelsApiKey }
             });
             const pexelsJson = await pexelsResponse.json();
             
             if (pexelsJson.photos && pexelsJson.photos.length > 0) {
                 const imageUrl = pexelsJson.photos[0].src.large2x || pexelsJson.photos[0].src.large;
                 console.log(`   ✅ Pexels image found. Downloading directly to memory buffer...`);
                 
                 const imgRes = await fetch(imageUrl);
                 const arrayBuf = await imgRes.arrayBuffer();
                 imageBuffer = Buffer.from(arrayBuf);
                 console.log(`   ✅ Image loaded into ArrayBuffer (${(imageBuffer.length / 1024).toFixed(2)} KB).`);
             } else {
                 console.warn(`   ⚠️ No images found on Pexels for query: ${generatedData.pexels_query}. Falling back to default professional query.`);
                 const fallbackRes = await fetch(`https://api.pexels.com/v1/search?query=business+office&per_page=1`, { headers: { Authorization: pexelsApiKey }});
                 const fallbackJson = await fallbackRes.json();
                 if (fallbackJson.photos && fallbackJson.photos.length > 0) {
                     const imgRes = await fetch(fallbackJson.photos[0].src.large);
                     imageBuffer = Buffer.from(await imgRes.arrayBuffer());
                 } else {
                     throw new Error("Pexels fallback failed.");
                 }
             }
         } catch (e) {
             console.error(`   ❌ Pexels API Error: ${e.message}`);
             continue;
         }

         // ==========================================
         // BROWSER LAUNCH (LAZY)
         // ==========================================
         if (!browserLaunched) {
             const launchOptions = {
                 headless: false,
                 args: ['--disable-blink-features=AutomationControlled']
             };
             if (proxyConfig) launchOptions.proxy = proxyConfig;

             browser = await chromium.launch(launchOptions);
             browserLaunched = true;
         }

         const context = await browser.newContext({
             permissions: ['clipboard-read', 'clipboard-write'],
             userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
         });

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
             console.log(`   🍪 Successfully injected LinkedIn Cookies.`);
         }

         const page = await context.newPage();

         try {
             console.log(`   🌍 Navigating to LinkedIn Feed...`);
             await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
             await delay(6000);

             console.log(`   🎯 Clicking "Start a post" button...`);
             const startPostBtn = page.locator('[aria-label="Start a post"], :text("Start a post")').first();
             await startPostBtn.waitFor({ state: 'visible', timeout: 15000 });
             await startPostBtn.click({ force: true });
             
             // Find the rich text editor
             console.log(`   🎯 Finding Composer Textbox...`);
             const editorBox = page.locator('.ql-editor, [role="textbox"], [data-testid="ql-editor"]').first();
             await editorBox.waitFor({ state: 'visible', timeout: 15000 });
             await editorBox.click({ force: true });
             await delay(500);

             console.log(`   📋 Injecting generated text via Clipboard Paste Trick...`);
             // Clear the textbox first just in case
             await page.keyboard.press('Control+A');
             await page.keyboard.press('Backspace');
             
             // Inject text to clipboard
             await page.evaluate((text) => navigator.clipboard.writeText(text), generatedData.linkedin_post_text);
             await delay(500);
             
             // Simulate keyboard paste (Cmd+V on Mac, Ctrl+V on Windows)
             const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
             await page.keyboard.press(`${modifier}+V`);
             await delay(2000);
             
             // Ensure React picks up the text
             await page.keyboard.press('Space');
             await delay(2000);
             
             // UPLOAD IMAGE NATIVELY TO FILE INPUT IN MODAL
             console.log(`   📸 Clicking "Add media" icon to reveal file input...`);
             const addMediaBtn = page.locator('button[aria-label="Add media"], button[aria-label="Add photo"], button[aria-label="Add a photo"], button.share-promoted-detour-button').first();
             await addMediaBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => console.log('   ⚠️ Add Media button wait timeout...'));
             await delay(1000);
             
             console.log(`   📤 Intercepting OS File Dialog & Uploading image...`);
             try {
                 const [fileChooser] = await Promise.all([
                     page.waitForEvent('filechooser', { timeout: 10000 }),
                     addMediaBtn.click({ force: true })
                 ]);
                 await fileChooser.setFiles({
                     name: 'pexels_linkedin.jpg',
                     mimeType: 'image/jpeg',
                     buffer: imageBuffer
                 });
                 console.log(`   ✅ File successfully injected via Playwright Chooser.`);
             } catch (e) {
                 console.log(`   ⚠️ Chooser failed: ${e.message}. Attempting direct input fallback...`);
                 const fileInput = page.locator('input[type="file"]').first();
                 await fileInput.setInputFiles({
                     name: 'pexels_linkedin.jpg',
                     mimeType: 'image/jpeg',
                     buffer: imageBuffer
                 });
             }
             
             // Wait for image preview/editor to render
             await delay(4000);
             
             // LinkedIn often opens a "Crop/Edit Photo" screen that requires clicking "Next" or "Done"
             console.log(`   📸 Checking for photo editor "Next" or "Done" button...`);
             // We only use the exact class from the modal to prevent finding generic "Next" buttons in the background feed
             const nextBtn = page.locator('.share-box-footer__primary-btn').filter({ state: 'visible' }).first();
             await nextBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
             if (await nextBtn.isVisible()) {
                 console.log(`   📸 Clicking "Next/Done" to confirm photo...`);
                 await delay(2000); // Wait for the button to become enabled
                 await nextBtn.click(); // Removed force: true so Playwright verifies actionability
                 await delay(4000);
             }

             console.log(`   🚀 Clicking Post Button...`);
             // We only use the exact class from the modal to prevent finding generic "Post" buttons in the background feed
             const postButton = page.locator('.share-actions__primary-action').filter({ state: 'visible' }).last();
             await postButton.waitFor({ state: 'visible', timeout: 15000 });
             await postButton.click();
             
             await delay(8000);
             
             // Screenshot for verification
             await page.screenshot({ path: `linkedin_success_slot_${account.slot}_post_${i+1}.png` }).catch(() => {});
             console.log(`   📸 Captured screenshot of successful LinkedIn post!`);

             // LOGGING
             await supabase.from('campaign_post_logs').insert({
                 campaign_id: campaign.id,
                 platform: 'LinkedIn',
                 account_slot: account.slot,
                 post_url: 'Direct LinkedIn Post'
             });
             console.log(`   ✅ DB Logging Successful!`);

         } catch (postErr) {
             console.error(`   ❌ [LINKEDIN POST FAILED] ${postErr.message}`);
             await page.screenshot({ path: `linkedin_failed_slot_${account.slot}_debug.png` }).catch(() => {});
             
             await supabase.from('worker_execution_logs').insert({
                 worker_type: 'LinkedIn Browser Poster',
                 platform: 'LinkedIn',
                 status: 'Failed',
                 reason: 'Post Automation Failed',
                 details: postErr.message,
                 account_slot: account.slot
             });
         } finally {
             // Close context after each post to keep session clean
             await context.close().catch(()=>{});
         }

         // Delay between posts for safety
         if (i < availableDailyPosts - 1) {
             console.log(`   ⏳ Waiting 15 seconds before next post...`);
             await delay(15000);
         }
      } // End of inner post loop

      if (browser) {
          await browser.close();
          console.log(`   🧹 Browser cleanly terminated.`);
      }
    } // End of account loop

    console.log("\n🎯 [COMPLETED] LinkedIn Poster Protocol Finished.");
  } catch (err) {
    console.error(`\n❌ [FATAL ERROR] LinkedIn Automation Aborted: -> ${err.message}`);
  }
}

const isMainModule = import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isMainModule) {
  runLinkedInPosterWorker().then(() => process.exit(0));
}
