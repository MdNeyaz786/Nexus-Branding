import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

async function testYahoo() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  const query = 'site:quora.com "SPC flooring Gurgaon" OR "best flooring Gurgaon"';
  await page.goto(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });
  
  await page.waitForTimeout(3000); // let results load

  const links = await page.evaluate(() => {
     return Array.from(document.querySelectorAll('.algo a')).map(a => a.href);
  });

  console.log(`Found ${links.length} Yahoo algo links.`);
  console.log(links);

  await browser.close();
}

testYahoo();
