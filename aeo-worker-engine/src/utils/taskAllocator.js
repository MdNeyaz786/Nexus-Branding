import { supabase } from '../config/supabase.js';

/**
 * Smart Distribution & Cross-Pollination Engine
 * Handles strict task allocation to prevent duplicate answers, spamming, and enforce organic delays.
 */

export async function getAvailableUrl(platform, accountSlot) {
  console.log(`\n🧠 [ALLOCATOR] Starting Safe URL search for Platform: '${platform}' | Slot: ${accountSlot}`);

  try {
    // 1. Fetch all pending URLs
    console.log(`🔍 [ALLOCATOR] Fetching 'pending' URLs from target_url_queue...`);
    const { data: urls, error: fetchError } = await supabase
      .from('target_url_queue')
      .select('target_url')
      .eq('platform', platform)
      .eq('status', 'pending');

    if (fetchError) {
      throw new Error(`Database fetch error: ${fetchError.message}`);
    }

    if (!urls || urls.length === 0) {
      console.log(`⚠️  [ALLOCATOR] No pending URLs available for ${platform}.`);
      return null;
    }

    console.log(`✅ [ALLOCATOR] Found ${urls.length} pending URL(s). Beginning strict evaluation...`);

    // 2. Iterate through URLs and evaluate rules
    for (const item of urls) {
      const currentUrl = item.target_url;
      console.log(`\n⚙️  [ALLOCATOR] Evaluating URL: ${currentUrl}`);

      // Fetch ledger history for this URL
      const { data: ledger, error: ledgerError } = await supabase
        .from('content_tracker_ledger')
        .select('account_slot, answered_at')
        .eq('platform', platform)
        .eq('target_url', currentUrl);

      if (ledgerError) {
        console.error(`❌ [ALLOCATOR] Failed to fetch ledger for ${currentUrl}: ${ledgerError.message}`);
        continue; // Skip to next URL on error
      }

      // ==========================================
      // RULE 1: No Self-Duplicate
      // ==========================================
      const hasSelfAnswered = ledger.some(record => record.account_slot === accountSlot);
      if (hasSelfAnswered) {
        console.log(`⏭️  [ALLOCATOR] [SKIP] Rule 1 Failed: Slot ${accountSlot} has already answered this URL.`);
        continue;
      }

      // ==========================================
      // RULE 2: Max 3 Limit
      // ==========================================
      if (ledger.length >= 3) {
        console.log(`🎯 [ALLOCATOR] [LIMIT REACHED] Rule 2 Triggered: URL already has ${ledger.length} answers. Updating status to 'completed'.`);
        
        const { error: updateError } = await supabase
          .from('target_url_queue')
          .update({ status: 'completed' })
          .eq('platform', platform)
          .eq('target_url', currentUrl);
          
        if (updateError) {
          console.error(`❌ [ALLOCATOR] Failed to update status: ${updateError.message}`);
        } else {
          console.log(`✅ [ALLOCATOR] Successfully marked URL as 'completed' in the queue.`);
        }
        continue;
      }

      // ==========================================
      // RULE 3: Cross-Pollination Delay (3 Days)
      // ==========================================
      if (ledger.length > 0) {
        // Sort to find the most recent answer
        const sortedLedger = [...ledger].sort((a, b) => new Date(b.answered_at) - new Date(a.answered_at));
        const lastAnsweredDate = new Date(sortedLedger[0].answered_at);
        const now = new Date();
        
        const diffInMs = now.getTime() - lastAnsweredDate.getTime();
        const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

        if (diffInDays < 3) {
          console.log(`⏭️  [ALLOCATOR] [SKIP] Rule 3 Failed: Last answered ${diffInDays.toFixed(1)} days ago. Requires full 3-day organic gap.`);
          continue;
        }
      }

      // ==========================================
      // PASSED ALL RULES
      // ==========================================
      console.log(`🎉 [ALLOCATOR] [MATCH FOUND] Safe URL successfully acquired!`);
      return currentUrl;
    }

    // If loop finishes without returning, no URLs passed the strict checks
    console.log(`\n⚠️  [ALLOCATOR] Evaluation complete. No safe URLs passed the strict rules for Slot ${accountSlot}.`);
    return null;

  } catch (err) {
    console.error(`❌ [ALLOCATOR FATAL ERROR] getAvailableUrl process crashed: ${err.message}`);
    return null;
  }
}

/**
 * Logs a successful answer entry into the ledger to strictly track limits and timestamps.
 */
export async function markUrlAsAnswered(platform, accountSlot, targetUrl) {
  console.log(`\n📝 [ALLOCATOR] Logging completed task to ledger -> URL: ${targetUrl} (Slot: ${accountSlot})`);
  try {
    const { error } = await supabase
      .from('content_tracker_ledger')
      .insert([
        {
          platform,
          account_slot: accountSlot,
          target_url: targetUrl,
          // answered_at will default to current timestamp if handled by DB, but we explicitly pass ISO here.
          answered_at: new Date().toISOString()
        }
      ]);

    if (error) {
      throw new Error(error.message);
    }
    
    console.log(`✅ [ALLOCATOR] Successfully committed answer record to ledger.`);
    return true;
  } catch (err) {
    console.error(`❌ [ALLOCATOR FATAL ERROR] markUrlAsAnswered failed: ${err.message}`);
    return false;
  }
}
