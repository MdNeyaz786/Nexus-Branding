import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
chromium.use(stealth());

import { supabase } from '../config/supabase.js';
import { getKeywordsFromGemini } from '../utils/geminiRotator.js';

/**
 * Enterprise "Cross-Pollination" Demand & Supply Scraper
 * Uses 1 Unique Keyword per Bot Account. Scrapes across multiple platforms (Quora, Reddit, X) 
 * for that specific keyword to fulfill the bot's daily platform quotas.
 */

const delay = (ms) => new Promise(res => setTimeout(res, ms));

export async function runDailyScraper() {
  console.log("\n=======================================================");
  console.log("   🌐 CROSS-PLATFORM SYNCHRONIZED AEO SCRAPER ENGINE   ");
  console.log("=======================================================\n");

  let browser = null;

  try {
    // ------------------------------------------------------------------
    // STEP 1: Fetch Campaigns
    // ------------------------------------------------------------------
    console.log(`📊 [STEP 1/5] Fetching campaign demands from 'client_campaigns'...`);
    
    const { data: campaigns, error: configError } = await supabase
      .from('client_campaigns')
      .select('*');

    if (configError) throw new Error(`Failed to fetch campaigns: ${configError.message}`);
    if (!campaigns || campaigns.length === 0) {
      console.log(`⚠️  [DEMAND] No active campaign configurations found. Exiting.`);
      return;
    }

    console.log(`✅ [DEMAND] Found ${campaigns.length} active campaigns.`);

    // ------------------------------------------------------------------
    // STEP 2: Playwright Initialization
    // ------------------------------------------------------------------
    console.log(`\n🌐 [STEP 2/5] Launching Chromium browser (Non-headless mode)...`);
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    console.log(`✅ [SUCCESS] Browser launched successfully.`);

    // ------------------------------------------------------------------
    // STEP 3: Campaign Iteration
    // ------------------------------------------------------------------
    for (const campaign of campaigns) {
      // 1. Determine Account Allocation based on target_scope
      let accounts_allocated = 0;
      const scope = campaign.target_scope ? campaign.target_scope.toLowerCase() : 'local';
      
      if (scope === 'local') accounts_allocated = 3;
      else if (scope === 'regional') accounts_allocated = 7;
      else if (scope === 'global') accounts_allocated = 10;
      else accounts_allocated = 3; // default

      console.log(`\n=======================================================\n`);
      console.log(`🎯 [CAMPAIGN] Processing: ${campaign.brand_name} (Scope: ${scope.toUpperCase()})`);
      console.log(`🤖 [BOTS ALLOCATED] ${accounts_allocated} Accounts`);
      
      // 2. Fetch Platform Rules (Limits)
      const { data: platformRules, error: rulesError } = await supabase
        .from('campaign_platform_rules')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('is_active', true);

      if (rulesError || !platformRules || platformRules.length === 0) {
        console.warn(`⚠️  [WARNING] No platform rules defined for this campaign. Please configure 'campaign_platform_rules' in Supabase.`);
        continue;
      }
      
      console.log(`📜 [RULES LOADED] Found ${platformRules.length} platform rules to cross-pollinate.`);

      // 3. Call Gemini Rotator for Dynamic Keywords
      const keywordsData = await getKeywordsFromGemini(
        campaign.brand_website, 
        campaign.brand_description, 
        campaign.location, 
        accounts_allocated
      );

      // Handle Quota Exhaustion / Errors
      if (keywordsData && keywordsData.status === 'pending') {
        console.error(`\n🚨 [FATAL WARNING] API Quota Exhausted. Suspending scraper until the next cron schedule.`);
        process.exit(0);
      }

      const generatedKeywords = keywordsData;

      // ------------------------------------------------------------------
      // STEP 4: Bot Cross-Pollination Loop
      // ------------------------------------------------------------------
      for (let i = 0; i < generatedKeywords.length; i++) {
        const keyword = generatedKeywords[i];
        const assignedSlot = i + 1; // Strict 1-to-1 mapping
        
        console.log(`\n-------------------------------------------------------`);
        console.log(`🔑 [ACCOUNT SLOT ${assignedSlot}] Exclusive Keyword: "${keyword}"`);
        
        // Loop through each configured platform for this specific slot
        for (const rule of platformRules) {
          const platformName = rule.platform;
          const quota = rule.actions_per_account;
          const platformLower = platformName.toLowerCase();
          
          if (platformLower === 'x' || platformLower === 'twitter') {
             console.log(`   ⏭️ Skipping search for ${platformName}. Bots will post directly, no URLs needed.`);
             continue; 
          }

          // ------------------------------------------------------------------
          // COOKIE INJECTION (THE "BOT-SCOUT" SECRET)
          // ------------------------------------------------------------------
          await context.clearCookies(); // Clear previous bot's cookies
          let hasValidCookie = false;

          const { data: accData } = await supabase.from('platform_accounts')
             .select('cookie_json')
             .eq('platform', platformName)
             .eq('slot', assignedSlot)
             .single();
          
          if (accData && accData.cookie_json) {
              try {
                  const cookies = typeof accData.cookie_json === 'string' ? JSON.parse(accData.cookie_json) : accData.cookie_json;
                  if (Array.isArray(cookies)) {
                      // Ultra-Robust Cookie Sanitizer for Playwright
                      const cleanCookies = cookies.map(c => {
                          const validSameSite = ['Strict', 'Lax', 'None'];
                          if (typeof c.sameSite === 'string' && c.sameSite.length > 0) {
                              // Normalize case (e.g. 'lax' -> 'Lax')
                              const normalized = c.sameSite.charAt(0).toUpperCase() + c.sameSite.slice(1).toLowerCase();
                              if (validSameSite.includes(normalized)) {
                                  c.sameSite = normalized;
                              } else {
                                  delete c.sameSite; // e.g. 'unspecified', 'no_restriction'
                              }
                          } else {
                              delete c.sameSite; // Delete if empty string, null, boolean, etc.
                          }
                          
                          // Fix expiration field names
                          if (c.expirationDate) {
                             c.expires = c.expirationDate;
                             delete c.expirationDate;
                          }
                          
                          // Remove unsupported Playwright cookie fields
                          delete c.hostOnly;
                          delete c.session;
                          delete c.storeId;
                          delete c.id;
                          
                          return c;
                      });
                      
                      await context.addCookies(cleanCookies);
                      hasValidCookie = true;
                      console.log(`   🍪 Injected active cookies for ${platformName} (Bot Slot ${assignedSlot})`);
                  }
              } catch (e) {
                  console.log(`   ⚠️ Failed to parse cookies for ${platformName}:`, e.message);
              }
          }

          let platformFilteredResults = [];
          if (!hasValidCookie && platformLower === 'quora') {
              console.log(`   ⏭️ No cookies found for Quora Slot ${assignedSlot}. Skipping to avoid Login Wall.`);
              continue; // Skip searching Quora for this slot
          } else {
              if (!hasValidCookie) {
                  console.log(`   ⚠️ No cookies found for ${platformName} Slot ${assignedSlot}. Searching as Guest.`);
              }
             try {
            if (platformLower === 'reddit') {
              // REDDIT INTERNAL SEARCH
              console.log(`   🌍 Navigating: Reddit Internal Search (Target: ${quota} URLs)`);
              const redditUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(keyword)}&type=link&sort=new`;
              await page.goto(redditUrl, { waitUntil: 'domcontentloaded' });
              
              const humanDelay = Math.floor(Math.random() * 1500) + 1500;
              await delay(humanDelay); 
              
              // REDDIT CAPTCHA/BAN DETECTION
              const pageText = await page.evaluate(() => document.body.innerText);
              if (pageText.includes('blocked') || pageText.includes('Whoa there, pardner!') || pageText.includes('Pardon our interruption')) {
                  console.error(`   ❌ [FATAL] Reddit IP Ban / CAPTCHA Detected!`);
                  await supabase.from('worker_execution_logs').insert({
                      worker_type: 'Scraper',
                      platform: 'Reddit',
                      status: 'Failed',
                      reason: 'CAPTCHA / IP Ban',
                      details: 'Reddit blocked the request.',
                      account_slot: assignedSlot
                  });
                  continue; // Skip this slot
              }
              
              await page.evaluate(() => window.scrollBy(0, 1000));
              await delay(1500);

              const results = await page.evaluate(() => {
                const items = [];
                document.querySelectorAll('a').forEach(anchor => {
                   let href = anchor.href;
                   if (href && href.includes('/comments/')) {
                      href = href.split('?')[0]; 
                      items.push({ url: href, publishedDate: "Recent" });
                   }
                });
                return items;
              });

              const seen = new Set();
              for (const r of results) {
                 if (!seen.has(r.url)) {
                    seen.add(r.url);
                    platformFilteredResults.push(r);
                 }
              }

            } else if (platformLower === 'quora') {
              // QUORA EXTERNAL SEMANTIC SEARCH (VIA DUCKDUCKGO HTML)
              console.log(`   🌍 Navigating: DDG Semantic Search for Quora (Target: ${quota} URLs)`);
              const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent('site:quora.com ' + keyword)}`;
              await page.goto(ddgUrl, { waitUntil: 'domcontentloaded' });
              
              const humanDelay = Math.floor(Math.random() * 1500) + 1500;
              await delay(humanDelay); 

              // DDG CAPTCHA DETECTION
              const pageText = await page.evaluate(() => document.body.innerText);
              if (pageText.includes('anomaly') || pageText.includes('suspicious') || pageText.includes('CAPTCHA') || pageText.includes('automated requests')) {
                  console.error(`   ❌ [FATAL] DuckDuckGo IP Ban / CAPTCHA Detected!`);
                  await supabase.from('worker_execution_logs').insert({
                      worker_type: 'Scraper',
                      platform: 'Quora (DDG)',
                      status: 'Failed',
                      reason: 'CAPTCHA / IP Ban',
                      details: 'DuckDuckGo blocked the request.',
                      account_slot: assignedSlot
                  });
                  continue; // Skip this slot
              }

              const results = await page.evaluate(() => {
                const items = [];
                const questionRegex = /^https:\/\/www\.quora\.com\/(unanswered\/)?[a-zA-Z0-9]+(-[a-zA-Z0-9]+)+$/i;
                
                document.querySelectorAll('a.result__url').forEach(anchor => {
                   let href = anchor.href;
                   if (href && href.includes('uddg=')) {
                      try {
                          const urlParams = new URL(href).searchParams;
                          let realUrl = urlParams.get('uddg');
                          if (realUrl) {
                              realUrl = decodeURIComponent(realUrl).split('?')[0]; 
                              if (questionRegex.test(realUrl)) {
                                  items.push({ url: realUrl, publishedDate: "Evergreen" });
                              }
                          }
                      } catch (e) { }
                   }
                });
                return items;
              });

              const seen = new Set();
              for (const r of results) {
                 if (!seen.has(r.url)) {
                    seen.add(r.url);
                    platformFilteredResults.push(r);
                 }
              }
            } else {
               console.log(`   ⏭️ Fallback logic for ${platformName} not implemented yet.`);
               continue;
            }

            // LOG EXECUTION TO DB
            if (platformFilteredResults.length > 0) {
                await supabase.from('worker_execution_logs').insert({
                    worker_type: 'Scraper',
                    platform: platformName,
                    status: 'Pass',
                    reason: null,
                    details: `Found ${platformFilteredResults.length} URLs.`,
                    account_slot: assignedSlot
                });
            } else {
                await supabase.from('worker_execution_logs').insert({
                    worker_type: 'Scraper',
                    platform: platformName,
                    status: 'Failed',
                    reason: 'No Results Found',
                    details: `Search returned 0 valid URLs for keyword: ${keyword}`,
                    account_slot: assignedSlot
                });
            }

          } catch (execError) {
              console.error(`   ❌ [ERROR] Failed scraping ${platformName}:`, execError.message);
              await supabase.from('worker_execution_logs').insert({
                  worker_type: 'Scraper',
                  platform: platformName,
                  status: 'Failed',
                  reason: 'Execution Error',
                  details: execError.message,
                  account_slot: assignedSlot
              });
              continue;
          }
          }

          // ------------------------------------------------------------------
          // DYNAMIC QUOTA ENFORCEMENT (FROM SUPABASE RULES)
          // ------------------------------------------------------------------
          const totalFound = platformFilteredResults.length;
          if (platformFilteredResults.length > quota) {
              platformFilteredResults = platformFilteredResults.slice(0, quota);
          }
          console.log(`   ✅ Found ${totalFound} URLs -> Selected Top ${platformFilteredResults.length} to match Database Quota (${quota}) for ${platformName}.`);

          // ------------------------------------------------------------------
          // STEP 5: Apply Quota and Store in Database
          // ------------------------------------------------------------------
          for (const res of platformFilteredResults) {
            try {
              console.log(`      ⏳ Saving -> ${res.url.substring(0, 40)}... [${res.publishedDate}]`);
              const { error: insertError } = await supabase
                .from('target_url_queue')
                .insert([{
                  platform: platformName,
                  campaign_id: campaign.id,
                  campaign_tier: scope,
                  target_url: res.url,
                  published_date: res.publishedDate,
                  assigned_account_slot: assignedSlot,
                  status: 'pending'
                }]);

              if (insertError && insertError.code !== '23505') {
                 console.error(`      ❌ [DB ERROR] ${insertError.message}`);
              }
            } catch (err) {
              console.error(`      ❌ [FATAL] Insert Exception: ${err.message}`);
            }
          }
          
          await delay(2000); // Wait between platform switches
        }
      }
    }

    console.log("\n🎯 [COMPLETED] Cross-Platform Synchronized Scraper protocol finished successfully.");

  } catch (error) {
    console.error(`\n❌ [FATAL ERROR] Scraper Automation Aborted:`);
    console.error(`   -> ${error.message}`);
  } finally {
    console.log(`\n🧹 [CLEANUP] Initiating guaranteed resource cleanup...`);
    if (browser) {
      await browser.close();
      console.log(`✅ [CLEANUP SUCCESS] Browser process cleanly terminated.`);
    }
  }
}

// Run the script
runDailyScraper();
