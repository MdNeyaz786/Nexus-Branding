/**
 * server.js
 * ============================================================
 * AEO Engine — Express Web Server (Render.com deployment)
 *
 * Two endpoints:
 *   GET  /health              — Keep-alive ping (every 14 min via cron-job.org)
 *   POST /api/cron/dispatcher — Secured cron trigger (every 30 min via cron-job.org)
 *
 * The dispatcher runs ASYNCHRONOUSLY after returning 200 OK immediately.
 * This prevents cron-job.org from timing out waiting for a 2-min process.
 * ============================================================
 */

import express  from 'express';
import dotenv   from 'dotenv';
import { runDispatcher } from './src/dispatcher.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;
const CRON_SECRET = process.env.CRON_SECRET; // Set this in Render env vars

app.use(express.json());

// ── Logging middleware ──────────────────────────────────────
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ============================================================
// GET /health
// Purpose: Prevent Render free-tier from sleeping.
// Set up cron-job.org to call this every 14 minutes.
// ============================================================
app.get('/health', (req, res) => {
    res.status(200).json({
        status:    'ok',
        service:   'AEO Worker Engine',
        timestamp: new Date().toISOString(),
    });
});

// ============================================================
// POST /api/cron/dispatcher
// Purpose: Secure cron trigger. Called every 30 min by cron-job.org.
//
// Security: Checks Authorization header for CRON_SECRET.
// Behaviour: Returns 200 IMMEDIATELY, then runs dispatcher async.
// This is critical — Playwright workers take 1-3 minutes each.
// ============================================================
app.post('/api/cron/dispatcher', async (req, res) => {
    // ── Auth check ──────────────────────────────────────────
    if (!CRON_SECRET) {
        console.error('❌ CRON_SECRET is not set in environment variables!');
        return res.status(500).json({ error: 'Server misconfigured.' });
    }

    const authHeader = req.headers['authorization'] || '';
    const token      = authHeader.replace('Bearer ', '').trim();

    if (token !== CRON_SECRET) {
        console.warn(`⚠️  Unauthorized dispatcher trigger attempt from ${req.ip}`);
        return res.status(401).json({ error: 'Unauthorized.' });
    }

    // ── Return 200 immediately so cron-job.org doesn't time out ──
    res.status(200).json({
        status:    'accepted',
        message:   'Dispatcher is running in the background.',
        timestamp: new Date().toISOString(),
    });

    // ── Fire-and-forget: run dispatcher without blocking ────
    // Using setImmediate so the HTTP response is flushed first.
    setImmediate(async () => {
        console.log('\n🚀 [SERVER] Cron trigger accepted. Launching dispatcher...\n');
        try {
            await runDispatcher();
            console.log('\n✅ [SERVER] Dispatcher finished cleanly.\n');
        } catch (err) {
            console.error(`\n❌ [SERVER] Dispatcher threw an uncaught error: ${err.message}`);
            console.error(err.stack);
        }
    });
});

// ── 404 catch-all ───────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: 'Not found.' });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('   🤖 AEO Worker Engine — Express Server Started');
    console.log(`   Listening on port ${PORT}`);
    console.log(`   /health        → Keep-alive endpoint`);
    console.log(`   /api/cron/dispatcher → Secured dispatcher trigger`);
    console.log('═══════════════════════════════════════════════════════');
});
