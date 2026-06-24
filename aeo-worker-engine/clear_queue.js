import { supabase } from './src/config/supabase.js';

async function clearQueue() {
  console.log("🧹 Clearing target_url_queue table...");
  // Delete all rows where id is not null (which means all rows)
  const { error } = await supabase.from('target_url_queue').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (error) {
    console.error("❌ Error clearing table:", error.message);
  } else {
    console.log("✅ target_url_queue table has been completely cleared!");
  }
}

clearQueue();
