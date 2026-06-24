/**
 * dispatcher.js
 * ============================================================
 * AEO Engine Smart Dispatcher — The Master Orchestrator
 *
 * Called by server.js when the cron trigger fires.
 * Runs strictly sequentially: One platform per run, one slot at a time.
 *
 * Core Logic:
 *  1. Lock check — prevent two dispatcher instances running in parallel
 *  2. Round-robin platform selection (reads current_platform_index from DB)
 *  3. For each account slot of that platform:
 *       a. Check daily limit from campaign_post_logs
 *       b. If limit hit → INSERT into pending_tasks, skip slot
 *       c. If ok → run the matching worker function
 *  4. Process pending_tasks (overdue rollover jobs) AFTER fresh tasks
 *  5. Advance platform index for next cron run
 *  6. Unlock — always (via try/finally)
 * ============================================================
 */

import { supabase } from './config/supabase.js';
import { sendErrorAlert, sendInfoAlert } from './utils/telegramAlerts.js';

import { runQuoraCommentWorker }   from './workers/quoraWorker.js';
import { runRedditPosterWorker }   from './workers/redditWorker.js';
import { runMediumPosterWorker }   from './workers/mediumPoster.js';
import { runLinkedInPosterWorker } from './workers/linkedinWorker.js';
import { runApiPosterWorker }      from './workers/apiPoster.js';
import { runGithubWorker }         from './workers/githubWorker.js';

// ============================================================
// PLATFORM CONFIGURATION
// Order matters — this is the round-robin sequence.
// Change daily_limit to match your platform policy.
// ============================================================
const PLATFORM_SEQUENCE = [
    { name: 'Quora',    worker: runQuoraCommentWorker,   daily_limit: 3 },
    { name: 'Reddit',   worker: runRedditPosterWorker,   daily_limit: 3 },
    { name: 'Medium',   worker: runMediumPosterWorker,   daily_limit: 1 },
    { name: 'LinkedIn', worker: runLinkedInPosterWorker, daily_limit: 2 },
    { name: 'Dev.to',   worker: runApiPosterWorker,      daily_limit: 1 },
    { name: 'GitHub',   worker: runGithubWorker,         daily_limit: 0 }, // GitHub uses 30-day cadence internally
];

// Dispatcher will force-unlock if a previous run has been stuck > this many minutes
const MAX_LOCK_MINUTES = 25;

// ============================================================
// HELPERS
// ============================================================
function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function getSystemConfig() {
    const { data, error } = await supabase
        .from('system_config')
        .select('dispatcher_running, dispatcher_started_at, current_platform_index')
        .eq('id', 1)
        .single();
    if (error) throw new Error(`system_config fetch failed: ${error.message}`);
    return data;
}

async function setLock(running) {
    const patch = { dispatcher_running: running };
    if (running) patch.dispatcher_started_at = new Date().toISOString();
    const { error } = await supabase
        .from('system_config')
        .update(patch)
        .eq('id', 1);
    if (error) throw new Error(`Lock update failed: ${error.message}`);
}

async function advancePlatformIndex(current) {
    const next = (current + 1) % PLATFORM_SEQUENCE.length;
    const { error } = await supabase
        .from('system_config')
        .update({ current_platform_index: next })
        .eq('id', 1);
    if (error) log(`⚠️  Failed to advance platform index: ${error.message}`);
    return next;
}

// Check how many posts a specific account slot made for a platform in the last 24 hours
async function getDailyUsage(platform, accountSlot) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
        .from('campaign_post_logs')
        .select('id')
        .eq('platform', platform)
        .eq('account_slot', accountSlot)
        .gte('created_at', since);
    if (error) log(`⚠️  dailyUsage query error: ${error.message}`);
    return (data || []).length;
}

// Queue a task to be retried on the next eligible day
async function queuePendingTask(campaignId, platform, accountSlot, reason) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const retryDate = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

    const { error } = await supabase
        .from('pending_tasks')
        .upsert({
            campaign_id:  campaignId,
            platform,
            account_slot: accountSlot,
            reason,
            retry_after:  retryDate,
        }, { onConflict: 'campaign_id,platform,account_slot' });

    if (error) {
        log(`⚠️  Failed to queue pending task (${platform} slot ${accountSlot}): ${error.message}`);
    } else {
        log(`📥 [ROLLOVER] ${platform} Slot ${accountSlot} → Campaign queued for ${retryDate}`);
    }
}

// ============================================================
// PENDING TASKS PROCESSOR
// Runs after all fresh tasks. Picks up overdue rollover jobs.
// ============================================================
async function processPendingTasks() {
    log('\n🔁 [PENDING TASKS] Checking for overdue rollover tasks...');

    const today = new Date().toISOString().split('T')[0];

    const { data: tasks, error } = await supabase
        .from('pending_tasks')
        .select('*, client_campaigns(*)')
        .lte('retry_after', today)
        .order('retry_after', { ascending: true });

    if (error) {
        log(`⚠️  pending_tasks fetch error: ${error.message}`);
        return;
    }

    if (!tasks || tasks.length === 0) {
        log('✅ [PENDING TASKS] No overdue tasks found.');
        return;
    }

    log(`📋 [PENDING TASKS] Found ${tasks.length} overdue task(s). Processing...`);

    for (const task of tasks) {
        log(`\n⏳ [PENDING] ${task.platform} Slot ${task.account_slot} — Campaign: ${task.client_campaigns?.brand_name}`);

        // Check if the slot's daily limit is clear today
        const config   = PLATFORM_SEQUENCE.find(p => p.name === task.platform);
        const dailyLimit = config?.daily_limit || 99;
        const usage    = await getDailyUsage(task.platform, task.account_slot);

        if (dailyLimit > 0 && usage >= dailyLimit) {
            log(`   ⏳ Still at daily limit. Pushing retry_after by 1 more day.`);
            const nextRetry = new Date();
            nextRetry.setDate(nextRetry.getDate() + 1);
            await supabase
                .from('pending_tasks')
                .update({
                    retry_after:   nextRetry.toISOString().split('T')[0],
                    attempt_count: task.attempt_count + 1,
                })
                .eq('id', task.id);
            continue;
        }

        // Max 5 retry attempts — after that, alert and delete
        if (task.attempt_count >= 5) {
            log(`   🚨 Task exceeded 5 retry attempts. Dropping and alerting.`);
            await sendErrorAlert(
                task.platform,
                task.account_slot,
                `Pending task for campaign "${task.client_campaigns?.brand_name}" exceeded 5 retries and was dropped. Manual action required.`
            );
            await supabase.from('pending_tasks').delete().eq('id', task.id);
            continue;
        }

        // Run the worker
        const workerFn = config?.worker;
        if (!workerFn) {
            log(`   ❌ No worker found for platform ${task.platform}. Skipping.`);
            continue;
        }

        try {
            log(`   🚀 Running ${task.platform} worker for pending task...`);
            await workerFn(); // Workers handle their own account/campaign selection internally
            log(`   ✅ Pending task completed successfully.`);
            await supabase.from('pending_tasks').delete().eq('id', task.id);
        } catch (err) {
            log(`   ❌ Pending task failed: ${err.message}`);
            await supabase
                .from('pending_tasks')
                .update({ attempt_count: task.attempt_count + 1 })
                .eq('id', task.id);
        }
    }
}

// ============================================================
// MAIN DISPATCHER
// ============================================================
export async function runDispatcher() {
    log('\n═══════════════════════════════════════════════════════');
    log('   🤖 AEO SMART DISPATCHER — Starting Run');
    log('═══════════════════════════════════════════════════════\n');

    let platformIndex = 0;

    // ── STEP 1: LOCK CHECK ──────────────────────────────────
    let config;
    try {
        config = await getSystemConfig();
    } catch (e) {
        log(`❌ FATAL: Cannot read system_config — ${e.message}`);
        return;
    }

    if (config.dispatcher_running) {
        const startedAt     = new Date(config.dispatcher_started_at);
        const minutesRunning = (Date.now() - startedAt.getTime()) / 60000;

        if (minutesRunning < MAX_LOCK_MINUTES) {
            log(`⚠️  Another dispatcher instance is already running (started ${minutesRunning.toFixed(1)} min ago). Exiting.`);
            return;
        }
        log(`⚠️  Previous dispatcher appears stuck (${minutesRunning.toFixed(1)} min). Force-overriding lock.`);
    }

    // ── STEP 2: SET LOCK ────────────────────────────────────
    try {
        await setLock(true);
        log('🔒 Lock acquired.');
    } catch (e) {
        log(`❌ FATAL: Cannot set dispatcher lock — ${e.message}`);
        return;
    }

    platformIndex = config.current_platform_index ?? 0;

    try {
        // ── STEP 3: SELECT PLATFORM FOR THIS RUN ────────────
        const platform = PLATFORM_SEQUENCE[platformIndex];
        log(`\n🎯 This run's platform: ${platform.name} (index ${platformIndex})`);
        log(`   Daily limit per slot: ${platform.daily_limit === 0 ? 'Managed internally by worker' : platform.daily_limit}`);

        // ── STEP 4: FETCH ACCOUNTS FOR THIS PLATFORM ────────
        const { data: accounts, error: accErr } = await supabase
            .from('platform_accounts')
            .select('*')
            .eq('platform', platform.name)
            .order('slot', { ascending: true });

        if (accErr) throw new Error(`Account fetch failed: ${accErr.message}`);

        if (!accounts || accounts.length === 0) {
            log(`   ℹ️  No accounts configured for ${platform.name}. Skipping platform.`);
        } else {
            log(`   📋 Found ${accounts.length} account slot(s) for ${platform.name}.`);

            // ── STEP 5: PROCESS EACH SLOT SEQUENTIALLY ──────
            for (const account of accounts) {
                log(`\n   ── Slot ${account.slot} ─────────────────────────────`);

                // ── CHECK: Does this slot have an auth credential? ──
                const hasCredential = platform.name === 'Dev.to' || platform.name === 'GitHub'
                    ? !!account.api_key    // API platforms need api_key
                    : !!account.cookie_json; // Browser platforms need cookies

                if (!hasCredential) {
                    log(`   ⚠️  Slot ${account.slot} has no ${platform.name === 'Dev.to' || platform.name === 'GitHub' ? 'API key' : 'cookie'}. Skipping (roll over).`);
                    continue;
                }

                // ── CHECK: Daily limit ──────────────────────────────
                if (platform.daily_limit > 0) {
                    const usage = await getDailyUsage(platform.name, account.slot);
                    if (usage >= platform.daily_limit) {
                        log(`   ⏳ Slot ${account.slot} at daily limit (${usage}/${platform.daily_limit}). Queuing for tomorrow.`);

                        // Queue rollover for each campaign this slot hasn't served today
                        const { data: campaigns } = await supabase
                            .from('client_campaigns')
                            .select('id, brand_name');

                        for (const campaign of (campaigns || [])) {
                            await queuePendingTask(campaign.id, platform.name, account.slot, 'daily_limit_reached');
                        }
                        continue;
                    }
                    log(`   ✅ Slot ${account.slot} usage: ${usage}/${platform.daily_limit}. Proceeding.`);
                }

                // ── RUN WORKER ──────────────────────────────────────
                // Workers handle internal campaign selection, quota checks, and DB logging.
                // Dispatcher just calls them — they return when done.
                log(`   🚀 Running ${platform.name} worker for Slot ${account.slot}...`);
                try {
                    await platform.worker();
                    log(`   ✅ Slot ${account.slot} completed successfully.`);
                } catch (err) {
                    log(`   ❌ Slot ${account.slot} worker threw an error: ${err.message}`);
                    await sendErrorAlert(
                        platform.name,
                        account.slot,
                        `Worker crashed during dispatcher run. Error: ${err.message}`
                    );
                    // Don't stop — continue to next slot
                }
            }
        }

        // ── STEP 6: ADVANCE PLATFORM INDEX ──────────────────
        const nextIndex = await advancePlatformIndex(platformIndex);
        log(`\n➡️  Next run will process: ${PLATFORM_SEQUENCE[nextIndex].name}`);

        // ── STEP 7: PROCESS PENDING/ROLLOVER TASKS ──────────
        await processPendingTasks();

        log('\n✅ Dispatcher run complete.');
        await sendInfoAlert(
            `✅ <b>Dispatcher Run Complete</b>\n` +
            `Platform processed: <b>${platform.name}</b>\n` +
            `Next platform: <b>${PLATFORM_SEQUENCE[nextIndex].name}</b>`
        );

    } catch (err) {
        log(`\n❌ DISPATCHER FATAL ERROR: ${err.message}`);
        log(err.stack);
        await sendErrorAlert('Dispatcher', 0, `Fatal crash during ${PLATFORM_SEQUENCE[platformIndex]?.name} run.\n\nError: ${err.message}`);

    } finally {
        // ── ALWAYS UNLOCK ────────────────────────────────────
        try {
            await setLock(false);
            log('🔓 Lock released.');
        } catch (e) {
            log(`⚠️  WARNING: Could not release lock: ${e.message}`);
        }
    }
}
