import { supabase } from "./src/config/supabase.js";

async function run() {
  const { data, error } = await supabase.from('client_campaigns').select('*');
  console.log("Error:", error);
  console.log("Data:", data);
}

run();
