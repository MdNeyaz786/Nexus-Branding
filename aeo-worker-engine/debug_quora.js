import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { supabase } from './src/config/supabase.js';

chromium.use(stealth());

async function debugQuora() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  
  // Inject Slot 1 Quora Cookie
  const { data: accData } = await supabase.from('platform_accounts').select('cookie_json').eq('platform', 'Quora').eq('slot', 1).single();
  if (accData && accData.cookie_json) {
      let cookies = typeof accData.cookie_json === 'string' ? JSON.parse(accData.cookie_json) : accData.cookie_json;
      const cleanCookies = cookies.map(c => {
          if (typeof c.sameSite === 'string' && c.sameSite.length > 0) {
              const norm = c.sameSite.charAt(0).toUpperCase() + c.sameSite.slice(1).toLowerCase();
              if (['Strict', 'Lax', 'None'].includes(norm)) c.sameSite = norm;
              else delete c.sameSite;
          } else {
              delete c.sameSite;
          }
          if (c.expirationDate) { c.expires = c.expirationDate; delete c.expirationDate; }
          delete c.hostOnly; delete c.session; delete c.storeId; delete c.id;
          return c;
      });
      await context.addCookies(cleanCookies);
      console.log("Cookie injected!");
  }

  const page = await context.newPage();
  await page.goto('https://www.quora.com/search?q=SPC+flooring+Gurgaon', { waitUntil: 'domcontentloaded' });
  
  await page.waitForTimeout(3000); // let results load
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(2000);

  const links = await page.evaluate(() => {
     return Array.from(document.querySelectorAll('a')).map(a => a.href);
  });

  console.log(`Found ${links.length} total links on page.`);
  
  const questionRegex = /^https:\/\/www\.quora\.com\/(unanswered\/)?[a-zA-Z0-9]+(-[a-zA-Z0-9]+)+$/i;
  
  const matches = links.filter(l => questionRegex.test(l.split('?')[0]));
  console.log("\n--- REGEX MATCHES ---");
  console.log(matches);

  const quoraLinks = links.filter(l => l.includes('quora.com'));
  console.log("\n--- ALL QUORA LINKS ---");
  const unique = [...new Set(quoraLinks.map(l => l.split('?')[0]))];
  console.log(unique);

  await browser.close();
}

debugQuora();
