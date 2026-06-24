import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  return response.ok;
}

export async function GET(req: Request) {
  // Simple cron authentication could be added here if needed (e.g. checking an Authorization header)
  
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    // 1. Get System Config
    const { data: config, error: configError } = await supabase
      .from("system_config")
      .select("telegram_bot_token, telegram_chat_id")
      .eq("id", 1)
      .single();

    if (configError || !config?.telegram_bot_token || !config?.telegram_chat_id) {
      return NextResponse.json({ message: "Telegram not configured. Skipping." }, { status: 200 });
    }

    // 2. Fetch platform accounts with expiring cookies (within next 24 hours)
    // We only need accounts where cookie_expiry is NOT NULL and not in the past (maybe past too if unhandled)
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: accounts, error: accountsError } = await supabase
      .from("platform_accounts")
      .select("*")
      .not("cookie_expiry", "is", null)
      .lt("cookie_expiry", twentyFourHoursFromNow.toISOString())
      .gt("cookie_expiry", now.toISOString()); // Exclude already expired (or keep them?)

    if (accountsError) throw accountsError;

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No expiring cookies found." }, { status: 200 });
    }

    const alerts24h = [];
    const alerts12h = [];
    const alerts6h = [];

    const updatesToPerform = [];

    // 3. Batch them up based on time limits
    for (const acc of accounts) {
      const expiry = new Date(acc.cookie_expiry);
      const hoursLeft = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);

      const updates: any = {};

      if (hoursLeft <= 6 && !acc.alert_6h_sent) {
        alerts6h.push(`- *${acc.platform}* (Slot ${acc.slot}): Expiring in ${Math.round(hoursLeft)} hours`);
        updates.alert_6h_sent = true;
        updates.alert_12h_sent = true;
        updates.alert_24h_sent = true;
      } else if (hoursLeft <= 12 && !acc.alert_12h_sent && hoursLeft > 6) {
        alerts12h.push(`- *${acc.platform}* (Slot ${acc.slot}): Expiring in ${Math.round(hoursLeft)} hours`);
        updates.alert_12h_sent = true;
        updates.alert_24h_sent = true;
      } else if (hoursLeft <= 24 && !acc.alert_24h_sent && hoursLeft > 12) {
        alerts24h.push(`- *${acc.platform}* (Slot ${acc.slot}): Expiring in ${Math.round(hoursLeft)} hours`);
        updates.alert_24h_sent = true;
      }

      if (Object.keys(updates).length > 0) {
        updatesToPerform.push({
          id: acc.id,
          platform: acc.platform,
          slot: acc.slot,
          ...updates
        });
      }
    }

    if (alerts6h.length === 0 && alerts12h.length === 0 && alerts24h.length === 0) {
      return NextResponse.json({ message: "No new alerts to send." }, { status: 200 });
    }

    // 4. Construct Telegram Message
    let messageText = "🚨 *AEO Cookie Expiry Alert* 🚨\n\n";

    if (alerts6h.length > 0) {
      messageText += "🔴 *CRITICAL (< 6 Hours):*\n" + alerts6h.join("\n") + "\n\n";
    }
    if (alerts12h.length > 0) {
      messageText += "🟠 *WARNING (< 12 Hours):*\n" + alerts12h.join("\n") + "\n\n";
    }
    if (alerts24h.length > 0) {
      messageText += "🟡 *NOTICE (< 24 Hours):*\n" + alerts24h.join("\n") + "\n\n";
    }

    messageText += "Please update these cookies in the AEO Core Admin Panel immediately.";

    // 5. Send Telegram Message
    const sent = await sendTelegramMessage(config.telegram_bot_token, config.telegram_chat_id, messageText);

    if (sent) {
      // 6. Update database flags so we don't send again
      // Supabase UPSERT doesn't support bulk dynamic updates well without an ID, but we have (platform, slot) unique constraint
      for (const update of updatesToPerform) {
        await supabase
          .from("platform_accounts")
          .update({
            alert_6h_sent: update.alert_6h_sent !== undefined ? update.alert_6h_sent : undefined,
            alert_12h_sent: update.alert_12h_sent !== undefined ? update.alert_12h_sent : undefined,
            alert_24h_sent: update.alert_24h_sent !== undefined ? update.alert_24h_sent : undefined,
          })
          .eq("platform", update.platform)
          .eq("slot", update.slot);
      }
      return NextResponse.json({ message: "Alerts sent successfully." }, { status: 200 });
    } else {
      return NextResponse.json({ error: "Failed to send Telegram message." }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
