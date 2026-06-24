import { supabase } from './src/config/supabase.js';

async function listModels() {
  console.log("Fetching API key from vault...");
  const { data: keysData, error } = await supabase.from('ai_keys_vault').select('*').limit(1);
  if (error || !keysData || keysData.length === 0) {
     return console.log("Failed to fetch API key");
  }
  
  const apiKey = keysData[0].api_key;
  console.log("Fetching supported models from Google API...");
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const json = await response.json();
  
  if (json.error) {
     console.log("API Error:", json.error);
     return;
  }
  
  const generateModels = json.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
  console.log("Supported Models for generateContent:");
  generateModels.forEach(m => console.log(" -", m.name.replace('models/', '')));
}

listModels();
