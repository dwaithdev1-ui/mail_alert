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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMeetingAlertScanner = startMeetingAlertScanner;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = __importStar(require("./db"));
// Standard meeting alert thresholds (in minutes before a meeting starts)
const ALERT_THRESHOLDS = [5, 10, 15];
/**
 * Scan database for scheduled meetings starting in the next 30 minutes
 * and generate alerts / in-app notifications if they fall under thresholds.
 */
async function scanUpcomingMeetings() {
    try {
        // 1. Fetch scheduled meetings starting in the next 30 minutes
        const query = `
      SELECT id, user_id, title, start_time
      FROM ${db_1.schemaName}.meetings
      WHERE status = 'scheduled'
        AND start_time > NOW()
        AND start_time <= NOW() + INTERVAL '30 minutes'
    `;
        const res = await db_1.default.query(query);
        const meetings = res.rows;
        if (meetings.length === 0) {
            return;
        }
        const nowMs = Date.now();
        for (const m of meetings) {
            const startTime = new Date(m.start_time).getTime();
            const diffMins = (startTime - nowMs) / 60000;
            // Only check thresholds if the meeting is still in the future
            if (diffMins <= 0)
                continue;
            for (const threshold of ALERT_THRESHOLDS) {
                // If remaining time is less than or equal to threshold
                if (diffMins <= threshold) {
                    const channel = 'in-app';
                    // 2. Check if this alert has already fired
                    const checkQuery = `
            SELECT id FROM ${db_1.schemaName}.alerts
            WHERE meeting_id = $1 AND threshold_min = $2 AND channel = $3
          `;
                    const alertCheck = await db_1.default.query(checkQuery, [m.id, threshold, channel]);
                    if (alertCheck.rows.length === 0) {
                        // 3. Log alert as fired (use ON CONFLICT DO NOTHING just in case of parallel check races)
                        const insertAlertQuery = `
              INSERT INTO ${db_1.schemaName}.alerts (meeting_id, threshold_min, channel)
              VALUES ($1, $2, $3)
              ON CONFLICT (meeting_id, threshold_min, channel) DO NOTHING
              RETURNING id
            `;
                        const alertRes = await db_1.default.query(insertAlertQuery, [m.id, threshold, channel]);
                        // If we successfully inserted the alert
                        if (alertRes.rows.length > 0) {
                            console.log(`[AlertScanner] Fired ${threshold}-minute alert for meeting: "${m.title}" (ID: ${m.id})`);
                            // 4. Create in-app notification
                            const message = `Meeting "${m.title}" starts in ${threshold} minute${threshold !== 1 ? 's' : ''}`;
                            const insertNotificationQuery = `
                INSERT INTO ${db_1.schemaName}.notifications (user_id, meeting_id, message)
                VALUES ($1, $2, $3)
              `;
                            await db_1.default.query(insertNotificationQuery, [m.user_id, m.id, message]);
                        }
                    }
                }
            }
        }
    }
    catch (err) {
        console.error('[AlertScanner] Error scanning upcoming meetings:', err);
    }
}
/**
 * Start the background meeting scanner.
 * It will run every minute.
 */
function startMeetingAlertScanner() {
    console.log('🚀 Background Meeting Alert Scanner initialized (running every minute)');
    // Run once immediately on startup
    scanUpcomingMeetings().catch(err => console.error('[AlertScanner] Initial run error:', err));
    // Schedule to run every minute
    node_cron_1.default.schedule('* * * * *', async () => {
        await scanUpcomingMeetings();
    });
}
