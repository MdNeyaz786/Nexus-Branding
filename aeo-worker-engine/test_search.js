import { search, SafeSearchType } from 'duck-duck-scrape';

async function testDDG() {
  const query = 'site:quora.com what is the best flooring for apartments in Gurgaon';
  console.log(`Searching: ${query}`);
  try {
    const searchResults = await search(query, {
      safeSearch: SafeSearchType.OFF
    });
    
    console.log(`Found ${searchResults.results.length} results!`);
    
    for (const res of searchResults.results) {
      console.log(`URL: ${res.url}`);
      console.log(`Snippet: ${res.description}`);
      console.log('---');
    }
  } catch (e) {
    console.log("Error:", e);
  }
}

testDDG();
