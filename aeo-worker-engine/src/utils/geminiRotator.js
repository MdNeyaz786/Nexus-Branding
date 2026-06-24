import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "../config/supabase.js";

/**
 * Generic Enterprise-Grade Round-Robin API Fallback System for Gemini.
 */
export async function generateWithGeminiRotator(prompt, options = {}) {
  const { startSlot = 1, parseJson = false, expectedArrayLength = null, systemInstruction = "You are an AEO (Answer Engine Optimization) expert." } = options;
  
  console.log(`\n=======================================================`);
  console.log(`   🔄 [GEMINI ROTATOR] Initializing Round-Robin System (Start Slot: ${startSlot})   `);
  console.log(`=======================================================`);

  // 1. Fetch keys from the vault
  const { data: keysData, error } = await supabase
    .from('ai_keys_vault')
    .select('*')
    .order('slot', { ascending: true });

  if (error || !keysData || keysData.length === 0) {
    console.error(`❌ [GEMINI FATAL] Failed to fetch API keys or vault is empty.`);
    return { status: 'pending', error: 'Vault empty or DB error' };
  }

  // Find the starting index based on startSlot
  let startIndex = keysData.findIndex(k => k.slot === startSlot);
  if (startIndex === -1) startIndex = 0; // Fallback to first available key if slot not found

  // 3. Fallback Logic Variables
  let currentIndex = startIndex;
  let roundCount = 0;
  const maxRounds = 2; // Allow looping through all keys twice maximum

  while (roundCount < maxRounds) {
    const currentKeyData = keysData[currentIndex];
    console.log(`\n🔌 [GEMINI] Attempting API call using Key Slot ${currentKeyData.slot}...`);

    try {
      const genAI = new GoogleGenerativeAI(currentKeyData.api_key);
      let responseText = null;
      let lastModelErr = null;

      // Model Fallback Loop
      const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];
      
      for (const modelName of modelsToTry) {
        try {
          console.log(`   🤖 Trying model: ${modelName}...`);
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: systemInstruction 
          });
          const result = await model.generateContent(prompt);
          responseText = result.response.text().trim();
          console.log(`   ✅ Success with model: ${modelName}`);
          break; // Stop trying models if successful
        } catch (err) {
          lastModelErr = err;
          console.log(`   -> ⚠️ Model ${modelName} failed. Reason: ${err.message.split('\n')[0]}`);
        }
      }

      if (!responseText) {
        throw new Error(`All models failed: ${lastModelErr?.message}`);
      }

      // Output Parsing
      if (parseJson) {
        let parsedData = null;
        try {
          const cleanText = responseText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
          parsedData = JSON.parse(cleanText);
        } catch (parseErr) {
          throw new Error(`Invalid JSON format returned by Gemini: ${responseText.substring(0, 50)}...`);
        }

        if (expectedArrayLength && (!Array.isArray(parsedData) || parsedData.length !== expectedArrayLength)) {
          throw new Error(`Expected JSON array of ${expectedArrayLength} items, got ${Array.isArray(parsedData) ? parsedData.length : 'not an array'}.`);
        }
        
        console.log(`✅ [GEMINI SUCCESS] Successfully generated JSON data using Slot ${currentKeyData.slot}!`);
        return parsedData;
      }

      console.log(`✅ [GEMINI SUCCESS] Successfully generated text using Slot ${currentKeyData.slot}!`);
      return responseText;

    } catch (err) {
      console.warn(`⚠️  [GEMINI ERROR] Key Slot ${currentKeyData.slot} Failed: ${err.message}`);
      
      // LOG TO SUPABASE WORKER LOGS
      await supabase.from('worker_execution_logs').insert({
          worker_type: 'Gemini',
          platform: 'API',
          status: 'Failed',
          reason: 'API Error',
          details: err.message,
          account_slot: currentKeyData.slot
      });
      
      // Move to the next key
      currentIndex++;
      
      // Loop back
      if (currentIndex >= keysData.length) {
        currentIndex = 0;
        roundCount++;
        if (roundCount < maxRounds) {
          console.log(`\n🔄 [GEMINI ROTATOR] Reached end of vault. Starting Round ${roundCount + 1}...`);
        }
      }
    }
  }

  console.error(`\n❌ [GEMINI FATAL] All keys exhausted. Suspending generation.`);
  return { status: 'pending', error: 'All keys exhausted' };
}

// Keep the original wrapper for backward compatibility with scraperWorker.js
export async function getKeywordsFromGemini(websiteUrl, brandDescription, targetLocation, accountsNeeded) {
  const prompt = `You are an AEO (Answer Engine Optimization) expert.
Brand Website: ${websiteUrl}
Brand Description: ${brandDescription}
Target Audience Location: ${targetLocation}

Generate exactly ${accountsNeeded} highly trending, distinct search keywords related to this brand's niche.
CRITICAL RULE FOR QUORA/REDDIT SEARCH: Do NOT generate long, complex sentences or full questions. Generate extremely SHORT, broad, and punchy keywords (MAXIMUM 3 to 6 words) that a normal human would type into a simple search bar to find discussions.
Example BAD: "What are some durable and stylish flooring options for a home in Gurgaon, India?"
Example GOOD: "best flooring options Gurgaon" OR "artificial grass balcony" OR "wall panels ideas india"

STRICT INSTRUCTION: Return ONLY a valid JSON array of strings (e.g., ["keyword 1", "keyword 2"]). Do NOT include markdown formatting, backticks (\`\`\`), or any extra text.`;

  return generateWithGeminiRotator(prompt, { 
    startSlot: 1, 
    parseJson: true, 
    expectedArrayLength: accountsNeeded 
  });
}
