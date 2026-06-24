/**
 * telegramAlerts.js
 * ==========================================
 * Centralized Telegram Alert Utility
 * 
 * Reads BOT_TOKEN and CHAT_ID from the database (system_config table).
 * Falls back to .env if DB is unreachable.
 * 
 * Exports:
 *   sendErrorAlert(platform, slot, message) — 🚨 CRITICAL alerts
 *   sendWarningAlert(platform, slot, message) — ⏰ WARNING alerts
 *   sendInfoAlert(message) — ℹ️ General info
 * ==========================================
 */

import { supabase } from '../config/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

// ==========================================
// INTERNAL: Get Telegram credentials
// Priority: Supabase DB > .env
// ==========================================
async function getTelegramConfig() {
    let botToken = process.env.TELEGRAM_BOT_TOKEN;
    let chatId   = process.env.TELEGRAM_CHAT_ID;

    try {
        const { data, error } = await supabase
            .from('system_config')
            .select('telegram_bot_token, telegram_chat_id')
            .eq('id', 1)
            .single();

        if (!error && data?.telegram_bot_token && data?.telegram_chat_id) {
            botToken = data.telegram_bot_token;
            chatId   = data.telegram_chat_id;
        }
    } catch (_) {
        // Silently fall back to .env values
    }

    return { botToken, chatId };
}

// ==========================================
// INTERNAL: Low-level send
// ==========================================
async function _send(text) {
    const { botToken, chatId } = await getTelegramConfig();

    if (!botToken || !chatId) {
        console.warn('   ⚠️ [TELEGRAM] Bot Token or Chat ID not configured. Skipping alert.');
        return false;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        const res = await fetch(url, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id:    chatId,
                text,
                parse_mode: 'HTML',
            }),
        });

        const result = await res.json();

        if (!res.ok || !result.ok) {
            console.error(`   ❌ [TELEGRAM] API error: ${result.description}`);
            return false;
        }

        return true;
    } catch (err) {
        console.error(`   ❌ [TELEGRAM] Network error: ${err.message}`);
        return false;
    }
}

// ==========================================
// PUBLIC: Error / Critical Alert
// ==========================================
/**
 * Sends a 🚨 critical error alert.
 * @param {string} platform  — e.g. 'LinkedIn'
 * @param {number} slot      — account slot number
 * @param {string} message   — error description
 */
export async function sendErrorAlert(platform, slot, message) {
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const text =
        `🚨 <b>CRITICAL ALERT — AEO Engine</b>\n\n` +
        `<b>Platform:</b> ${platform}\n` +
        `<b>Account Slot:</b> #${slot}\n` +
        `<b>Error:</b> ${message}\n\n` +
        `⏱ <i>${now} IST</i>\n\n` +
        `Action required in <b>Admin Panel</b> immediately.`;

    const sent = await _send(text);
    if (sent) {
        console.log(`   📲 [TELEGRAM] 🚨 Critical alert sent for ${platform} Slot ${slot}.`);
    }
    return sent;
}

// ==========================================
// PUBLIC: Warning Alert
// ==========================================
/**
 * Sends a ⏰ warning alert.
 * @param {string} platform  — e.g. 'Quora'
 * @param {number} slot      — account slot number
 * @param {string} message   — warning description
 */
export async function sendWarningAlert(platform, slot, message) {
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const text =
        `⏰ <b>WARNING — AEO Engine</b>\n\n` +
        `<b>Platform:</b> ${platform}\n` +
        `<b>Account Slot:</b> #${slot}\n` +
        `<b>Warning:</b> ${message}\n\n` +
        `⏱ <i>${now} IST</i>\n\n` +
        `Please update this account in the Admin Panel soon.`;

    const sent = await _send(text);
    if (sent) {
        console.log(`   📲 [TELEGRAM] ⏰ Warning alert sent for ${platform} Slot ${slot}.`);
    }
    return sent;
}

// ==========================================
// PUBLIC: General Info Alert
// ==========================================
/**
 * Sends an ℹ️ informational alert (e.g. daily summary).
 * @param {string} message  — any text
 */
export async function sendInfoAlert(message) {
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const text =
        `ℹ️ <b>AEO Engine — Info</b>\n\n` +
        `${message}\n\n` +
        `⏱ <i>${now} IST</i>`;

    const sent = await _send(text);
    if (sent) {
        console.log(`   📲 [TELEGRAM] ℹ️ Info alert sent.`);
    }
    return sent;
}
