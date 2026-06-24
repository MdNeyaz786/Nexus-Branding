import { supabase } from './src/config/supabase.js';

async function checkSchema() {
  const { data, error } = await supabase.from('client_campaigns').select('*').limit(1);
  if (error) {
    console.error("Error fetching client_campaigns:", error);
  } else {
    console.log("client_campaigns columns:", data.length > 0 ? Object.keys(data[0]) : "Table is empty");
    if (data.length > 0) {
      console.log("Sample Data:", data[0]);
    }
  }
}

checkSchema();
