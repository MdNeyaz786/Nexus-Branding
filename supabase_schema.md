# Supabase Database Schema Tracker
**Last Updated:** 2026-06-21

Yeh document hamare backend database (Supabase) ka blueprint hai. Jab bhi hum koi naya table ya column banayenge, hum is file ko update karenge. Isse system ko samajhne mein asani hogi aur aage chal kar kabhi data conflicts (jaise `campaign_task_config` vs `client_campaigns`) nahi honge.

---

## 1. `client_campaigns`
**Purpose:** Yeh table user dvara banaye gaye naye campaigns (projects) ki master details store karta hai. Yeh sabse pehla starting point hai.
*   `id` (UUID/Integer): Campaign ki unique ID.
*   `user_id` (UUID): Kis user ne banaya.
*   `brand_name` (Text): Brand ka naam (e.g., Nexus Branding).
*   `location` (Text): Target audience location (e.g., Gurgaon, India).
*   `competitors` (JSONB): Competitors ke naam aur URLs.
*   `keywords` (Text[]/JSON): Brand ke primary seed keywords.
*   `created_at` (Timestamp): Campaign kab bana tha.

## 2. `platform_accounts`
**Purpose:** Yeh table alag-alag platforms (Dev.to, Quora, Reddit) ke login details, cookies, API keys aur proxy manage karta hai.
*   `id` (Serial): Unique record ID.
*   `platform` (Text): 'Quora', 'Reddit', 'Dev.to' etc.
*   `slot` (Integer): Account ka number (1, 2, 3...).
*   `authType` (Text): 'Cookies' ya 'API Key'.
*   `proxy_ip` (Text): Proxy server address.
*   `cookie_json` (JSONB): Browser cookies.
*   `api_key` (Text): Direct API post ke liye key.
*   `cookie_expiry` (Timestamp): Cookies kab expire ho rahi hain.
*   `alert_24h_sent`, `alert_12h_sent`, `alert_6h_sent` (Boolean): Telegram alert status.

## 3. `ai_keys_vault`
**Purpose:** Yeh Gemini AI ke multiple API keys ko round-robin aur fallback logic ke liye store karta hai.
*   `id` (Serial): Unique record ID.
*   `slot` (Integer): Key ka number (1, 2, 3...).
*   `api_key` (Text): Google Gemini ki actual key.
*   `telegram_key` (Text): Optional metadata.

## 4. `target_url_queue`
**Purpose:** Scraper engine (`scraperWorker.js`) jab search engine se Quora/Reddit ke questions find karta hai, toh URLs yahan jama hoti hain answer post karne ke liye.
*   *(Columns: target_url, platform, keyword_used, status, etc.)*

## 5. `campaign_post_logs`
**Purpose:** Yeh API/Browser poster worker ko batata hai ki pichla article kis din post hua tha, taaki 3-day cron job cadence maintain rahe.
*   `id` (Serial): Unique record ID.
*   `campaign_id` (UUID/Integer): `client_campaigns` table ka reference.
*   `platform` (Text): Kahan post hua (e.g., Dev.to).
*   `account_slot` (Integer): Kis account slot ne post kiya.
*   `post_url` (Text): Live article ka URL.
*   `created_at` (Timestamp): Post ki timing.

## 6. `system_config`
**Purpose:** Global settings jise sirf ek baar set kiya jata hai (Singleton).
*   `id` (Serial): Always 1.
*   `telegram_bot_token` (Text): Alerting bot token.
*   `telegram_chat_id` (Text): Alert receiver group/ID.

## 7. `worker_execution_logs`
**Purpose:** Background cron jobs mein aane wali errors (API failures, banned accounts, captchas) yahan report hoti hain Admin Panel ke liye.
*   `id` (Serial): Unique record ID.
*   `worker_type` (Text): Kaunsa script fail hua (e.g., 'Gemini', 'Dev.to API Poster').
*   `platform` (Text): 'API' ya 'Quora', etc.
*   `status` (Text): 'Failed'.
*   `reason` (Text): 'API Error', 'Missing Proxy', etc.
*   `details` (Text): Error message log.
*   `account_slot` (Integer): Kis account par galti hui.

---

### Deprecated / Removed Tables
*   ❌ `campaign_task_config`: (Removed on 2026-06-21). Iska duplicate use ho raha tha jabki original data `client_campaigns` mein tha. Codebase mein isko `client_campaigns` se replace kar diya gaya hai.
