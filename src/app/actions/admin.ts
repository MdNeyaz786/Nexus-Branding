"use server";

import { createClient } from "@supabase/supabase-js";
import { aiKeySchema, platformAccountSchema } from "@/lib/schemas";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

export async function saveAiKey(formData: FormData | any) {
  try {
    let dataObj = formData;
    if (formData instanceof FormData) {
      dataObj = Object.fromEntries(formData.entries());
      dataObj.slot = parseInt(dataObj.slot as string, 10);
    }
    const validatedData = aiKeySchema.parse(dataObj);

    // Explicitly log the masked key to terminal
    console.log(`\n🔑 Saving AI Key to Vault: ${validatedData.key.substring(0, 6)}...`);

    if (!supabase) {
      console.warn("Supabase credentials missing. Simulating success.");
      await new Promise(resolve => setTimeout(resolve, 800));
      return { success: true };
    }

    const { error } = await supabase
      .from("ai_keys_vault")
      .upsert({
        slot: validatedData.slot,
        api_key: validatedData.key,
      }, { onConflict: "slot" });

    if (error) {
      console.error("Supabase Error saving AI Key:", error);
      return { success: false, error: "Failed to save AI key." };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Validation Error:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

export async function savePlatformAccount(formData: unknown) {
  try {
    const validatedData = platformAccountSchema.parse(formData);

    if (!supabase) {
      console.warn("Supabase credentials missing. Simulating success.");
      await new Promise(resolve => setTimeout(resolve, 800));
      return { success: true };
    }

    let cookieExpiryIso: string | null = null;

    if (validatedData.authType === "Cookies" && validatedData.cookie) {
      try {
        const parsedCookies = JSON.parse(validatedData.cookie);
        if (Array.isArray(parsedCookies)) {
          // Find the earliest expiration date
          let earliestExp = Infinity;
          for (const c of parsedCookies) {
            if (c.expirationDate && typeof c.expirationDate === 'number') {
              if (c.expirationDate < earliestExp) earliestExp = c.expirationDate;
            } else if (c.expires && typeof c.expires === 'number') {
              if (c.expires < earliestExp) earliestExp = c.expires;
            }
          }
          if (earliestExp !== Infinity) {
            // Epoch seconds to JS Date (milliseconds)
            cookieExpiryIso = new Date(earliestExp * 1000).toISOString();
          }
        }
      } catch (e) {
        console.error("Failed to parse cookie expiration:", e);
      }
    }

    // Upsert using a compound unique key: (platform, slot)
    const { error } = await supabase
      .from("platform_accounts")
      .upsert({
        platform: validatedData.platform,
        slot: validatedData.slot,
        cookie_json: validatedData.authType === "Cookies" ? validatedData.cookie : null,
        api_key: validatedData.authType === "API Key" ? validatedData.apiKey : null,
        proxy_ip: validatedData.proxy || null,
        cookie_expiry: cookieExpiryIso,
        alert_24h_sent: false,
        alert_12h_sent: false,
        alert_6h_sent: false
      }, { onConflict: "platform,slot" });

    if (error) {
      console.error("Supabase Error saving Platform Account:", error);
      return { success: false, error: "Failed to save platform account." };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Validation Error:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

export async function getAiKeysStatus() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("ai_keys_vault")
      .select("slot");
    if (error) throw error;
    return data.map((d: any) => d.slot); // Array of filled slots
  } catch (error) {
    console.error("Error fetching AI Keys Status:", error);
    return [];
  }
}

export async function getPlatformAccountsStatus() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("platform_accounts")
      .select("platform, slot, cookie_json, api_key, proxy_ip");
    if (error) throw error;
    
    return data.map((d: any) => ({
      platform: d.platform,
      slot: d.slot,
      authType: d.api_key ? "API Key" : "Cookies",
      hasProxy: !!d.proxy_ip,
    }));
  } catch (error) {
    console.error("Error fetching Platform Accounts Status:", error);
    return [];
  }
}

export async function saveSystemConfig(formData: unknown) {
  try {
    const { systemConfigSchema } = await import('@/lib/schemas');
    const validatedData = systemConfigSchema.parse(formData);
    
    if (!supabase) {
      console.warn("Supabase credentials missing. Simulating success.");
      await new Promise(resolve => setTimeout(resolve, 800));
      return { success: true };
    }

    // Upsert singleton config with id = 1
    const { error } = await supabase
      .from("system_config")
      .upsert({
        id: 1, // Singleton row
        telegram_bot_token: validatedData.telegramBotToken,
        telegram_chat_id: validatedData.telegramChatId,
        pexels_api_key: validatedData.pexelsApiKey || null,
        updated_at: new Date().toISOString()
      }, { onConflict: "id" });

    if (error) {
      console.error("Supabase Error saving System Config:", error);
      return { success: false, error: "Failed to save configuration." };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Validation Error:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

export async function getSystemConfig() {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("system_config")
      .select("telegram_bot_token, telegram_chat_id, pexels_api_key")
      .eq("id", 1)
      .single();
      
    if (error && error.code !== 'PGRST116') throw error; // ignore no rows error
    return data;
  } catch (error) {
    console.error("Error fetching System Config:", error);
    return null;
  }
}

// ==========================================
// CAMPAIGNS & LOGS
// ==========================================

export async function getCampaigns() {
  if (!supabase) return { success: false, error: "Supabase not configured." };
  
  try {
    const { data, error } = await supabase
      .from("client_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getCampaignLogs(campaignId: string) {
  if (!supabase) return { success: false, error: "Supabase not configured." };
  
  try {
    const { data, error } = await supabase
      .from("campaign_post_logs")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
