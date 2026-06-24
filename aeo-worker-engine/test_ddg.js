import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

async function testDDG() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  const query = 'site:quora.com SPC flooring Gurgaon';
  console.log(`Searching DDG for: ${query}`);
  
  await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
  
  await page.waitForTimeout(3000); // let results load

  const links = await page.evaluate(() => {
     return Array.from(document.querySelectorAll('a.result__url')).map(a => a.href);
  });

  console.log(`Found ${links.length} DDG links.`);
  console.log(links);

  await browser.close();
}

testDDG();
