"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importStar(require("../db"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.post('/sync', async (req, res) => {
    const { googleAccessToken } = req.body;
    if (!googleAccessToken) {
        return res.status(400).json({ error: 'googleAccessToken is required' });
    }
    try {
        const timeMin = new Date().toISOString();
        const gRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime&conferenceDataVersion=1`, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        if (!gRes.ok) {
            throw new Error(`Google API returned ${gRes.status}`);
        }
        const data = await gRes.json();
        const items = data.items || [];
        let syncedCount = 0;
        for (const item of items) {
            if (!item.start?.dateTime || !item.end?.dateTime)
                continue; // Skip all-day events for now
            let location = item.location || null;
            if (!location && item.conferenceData?.entryPoints) {
                const videoEntryPoint = item.conferenceData.entryPoints.find((ep) => ep.entryPointType === 'video');
                if (videoEntryPoint?.uri) {
                    location = videoEntryPoint.uri;
                }
            }
            await db_1.default.query(`INSERT INTO ${db_1.schemaName}.meetings 
           (user_id, title, start_time, end_time, location, description, google_event_id, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'google')
         ON CONFLICT (google_event_id) DO UPDATE SET
           title = EXCLUDED.title,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           location = EXCLUDED.location,
           description = EXCLUDED.description,
           updated_at = NOW()`, [
                req.userId,
                item.summary || 'Untitled Event',
                item.start.dateTime,
                item.end.dateTime,
                location,
                item.description || null,
                item.id
            ]);
            syncedCount++;
        }
        res.json({ success: true, syncedCount });
    }
    catch (error) {
        console.error('Calendar sync error:', error);
        res.status(500).json({ error: 'Failed to sync calendar', details: error.message });
    }
});
exports.default = router;
