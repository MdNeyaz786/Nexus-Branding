"use server";

import { createClient } from "@supabase/supabase-js";
import { campaignSchema } from "@/lib/schemas";

// Initialize Supabase Client
// Note: Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create client conditionally so it doesn't crash if vars are missing during build
const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

export async function submitCampaign(formData: unknown) {
  try {
    // 1. Simulate Clerk Authentication
    const userId = "temp_clerk_user_123";

    // 2. Validate data strictly with Zod
    const validatedData = campaignSchema.parse(formData);

    if (!supabase) {
      console.warn("Supabase credentials missing. Simulating success for now.");
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { success: true };
    }

    // 3. Insert into Supabase
    const { data, error } = await supabase
      .from("client_campaigns")
      .insert([
        {
          user_id: userId,
          brand_name: validatedData.brandName,
          brand_website: validatedData.brandWebsite,
          brand_description: validatedData.brandDescription,
          target_scope: validatedData.targetScope,
          location: validatedData.location ? validatedData.location.join(", ") : null,
          competitors: validatedData.competitors,
          keywords: validatedData.keywords,
        },
      ]);

    if (error) {
      console.error("Supabase Error:", error);
      return { success: false, error: "Failed to save campaign to database." };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Validation or Server Error:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}
