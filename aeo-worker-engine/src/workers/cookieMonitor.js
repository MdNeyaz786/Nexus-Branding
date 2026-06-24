/**
 * cookieMonitor.js
 * ==========================================
 * Pre-emptive Cookie Radar — Daily Cron Worker
 *
 * Scans `platform_accounts` for the `cookie_expires_at` column and:
 *   1. 🚨 CRITICAL  — cookie is ALREADY expired (past timestamp)
 *   2. ⏰ WARNING   — cookie expires within the NEXT 24 hours
 *
 * Run daily via cron:
 *   node src/workers/cookieMonitor.js
 *
 * Exits cleanly with process.exit(0) after all alerts are dispatched.
 * ==========================================
 */

import { supabase }        from '../config/supabase.js';
import { sendErrorAlert, sendWarningAlert, sendInfoAlert } from '../utils/telegramAlerts.js';

async function runCookieMonitor() {
    console.log('\n=======================================================');
    console.log('   🍪 AEO COOKIE RADAR — PRE-EMPTIVE MONITOR           ');
    console.log('=======================================================\n');

    try {
        // ==========================================
        // 1. Fetch ALL accounts that have a cookie_expires_at set
        // ==========================================
        console.log('   📡 Fetching platform accounts with cookie expiry data...');
        const { data: accounts, error } = await supabase
            .from('platform_accounts')
            .select('platform, slot, cookie_expiry')
            .not('cookie_expiry', 'is', null);

        if (error) throw error;

        if (!accounts || accounts.length === 0) {
            console.log('   ✅ No accounts with `cookie_expiry` set. Nothing to monitor.');
            await sendInfoAlert('🍪 Cookie Monitor ran — no accounts with expiry dates configured yet.');
            process.exit(0);
        }

        console.log(`   🔍 Evaluating ${accounts.length} account(s)...\n`);

        const now               = new Date();
        const in24Hours         = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        let criticalCount = 0;
        let warningCount  = 0;

        for (const acc of accounts) {
            const { platform, slot, cookie_expiry } = acc;
            const expiresAt = new Date(cookie_expiry);

            // ==========================================
            // CASE 1: ALREADY EXPIRED → CRITICAL
            // ==========================================
            if (expiresAt <= now) {
                const expiredMinsAgo = Math.round((now - expiresAt) / (1000 * 60));
                const expiredLabel   = expiredMinsAgo < 60
                    ? `${expiredMinsAgo} minutes ago`
                    : `${Math.round(expiredMinsAgo / 60)} hours ago`;

                console.log(`   🚨 CRITICAL — ${platform} Slot ${slot} cookie EXPIRED ${expiredLabel}.`);

                await sendErrorAlert(
                    platform,
                    slot,
                    `Cookie has EXPIRED (expired ${expiredLabel}). All posts for this account are now BLOCKED. Update the cookie immediately to resume automation.`
                );

                criticalCount++;

            // ==========================================
            // CASE 2: EXPIRING WITHIN 24h → WARNING
            // ==========================================
            } else if (expiresAt <= in24Hours) {
                const hoursLeft = ((expiresAt - now) / (1000 * 60 * 60)).toFixed(1);

                console.log(`   ⏰ WARNING  — ${platform} Slot ${slot} cookie expires in ${hoursLeft} hours.`);

                await sendWarningAlert(
                    platform,
                    slot,
                    `Cookie expires in <b>${hoursLeft} hours</b>. Please log into the Admin Panel and refresh the cookie before it expires, or all future posts for this account will fail.`
                );

                warningCount++;

            } else {
                // Cookie is healthy — just log locally, no Telegram needed
                const daysLeft = ((expiresAt - now) / (1000 * 60 * 60 * 24)).toFixed(1);
                console.log(`   ✅ HEALTHY  — ${platform} Slot ${slot} | ${daysLeft} day(s) remaining.`);
            }
        }

        // ==========================================
        // 3. Daily Summary Alert
        // ==========================================
        const summaryLines = [
            `<b>🍪 Daily Cookie Monitor Report</b>`,
            ``,
            `Total Accounts Checked: <b>${accounts.length}</b>`,
            `🚨 Critical (Expired):   <b>${criticalCount}</b>`,
            `⏰ Warnings (&lt;24h):     <b>${warningCount}</b>`,
            `✅ Healthy:              <b>${accounts.length - criticalCount - warningCount}</b>`,
        ].join('\n');

        await sendInfoAlert(summaryLines);

        console.log('\n   📊 Summary:');
        console.log(`      Accounts Checked : ${accounts.length}`);
        console.log(`      Critical (Expired): ${criticalCount}`);
        console.log(`      Warnings (<24h)  : ${warningCount}`);
        console.log(`      Healthy          : ${accounts.length - criticalCount - warningCount}`);

        console.log('\n🎯 [COMPLETED] Cookie Radar finished. Exiting cleanly.\n');
        process.exit(0);

    } catch (err) {
        console.error(`\n❌ [FATAL] Cookie Monitor crashed: ${err.message}`);

        // Even on crash, try to alert via Telegram
        try {
            await sendErrorAlert(
                'System',
                0,
                `Cookie Monitor script crashed unexpectedly!\n\nError: <code>${err.message}</code>`
            );
        } catch (_) { /* swallow */ }

        process.exit(1);
    }
}

runCookieMonitor();
