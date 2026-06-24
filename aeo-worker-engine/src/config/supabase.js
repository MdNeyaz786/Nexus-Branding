import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Missing Supabase credentials in .env");
}

// Initialize and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);
