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
const db_1 = __importStar(require("./db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
async function initDb() {
    console.log('Initializing database…');
    console.log(`Schema: ${db_1.schemaName}`);
    const client = await db_1.default.connect();
    try {
        // ── 0. Schema ─────────────────────────────────────────────────────────
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${db_1.schemaName}`);
        console.log(`✓ Schema "${db_1.schemaName}"`);
        // ── 1. users ──────────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${db_1.schemaName}.users (
        id           SERIAL PRIMARY KEY,
        full_name    VARCHAR(100)  NOT NULL,
        username     VARCHAR(100)  UNIQUE NOT NULL,
        password     VARCHAR(255)  NOT NULL,
        google_token TEXT,           -- stored Google access_token (encrypted in Prod)
        google_refresh_token TEXT,   -- for server-side token refresh
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Add google token columns if migrating an existing DB
        await client.query(`
      ALTER TABLE ${db_1.schemaName}.users
        ADD COLUMN IF NOT EXISTS google_token         TEXT,
        ADD COLUMN IF NOT EXISTS google_refresh_token TEXT
    `);
        console.log('✓ Table users');
        // ── 2. meetings ───────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${db_1.schemaName}.meetings (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES ${db_1.schemaName}.users(id) ON DELETE CASCADE,
        title          VARCHAR(255) NOT NULL,
        start_time     TIMESTAMPTZ  NOT NULL,
        end_time       TIMESTAMPTZ  NOT NULL,
        location       TEXT,
        description    TEXT,
        gcal_event_id  VARCHAR(255),        -- Google Calendar event ID (for write-back)
        google_event_id VARCHAR(255) UNIQUE,
        color_id       VARCHAR(10),
        source         VARCHAR(50) DEFAULT 'manual', -- 'manual' | 'google' | 'email' | 'agent'
        status         VARCHAR(20) DEFAULT 'scheduled',
                                             -- 'scheduled' | 'ongoing' | 'done' | 'cancelled'
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT chk_meeting_time CHECK (end_time > start_time)
      )
    `);
        // Migrate existing meetings table — add any missing columns
        await client.query(`
      ALTER TABLE ${db_1.schemaName}.meetings
        ADD COLUMN IF NOT EXISTS user_id       INTEGER REFERENCES ${db_1.schemaName}.users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS location      TEXT,
        ADD COLUMN IF NOT EXISTS description   TEXT,
        ADD COLUMN IF NOT EXISTS gcal_event_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS color_id      VARCHAR(10),
        ADD COLUMN IF NOT EXISTS source        VARCHAR(50) DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS status        VARCHAR(20) DEFAULT 'scheduled',
        ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();
        
      ALTER TABLE ${db_1.schemaName}.meetings
        DROP CONSTRAINT IF EXISTS uq_google_event_id;

      ALTER TABLE ${db_1.schemaName}.meetings
        ADD CONSTRAINT uq_google_event_id UNIQUE (google_event_id);
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meetings_user_start
        ON ${db_1.schemaName}.meetings(user_id, start_time)
    `);
        console.log('✓ Table meetings');
        // ── 3. alerts ─────────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${db_1.schemaName}.alerts (
        id            SERIAL PRIMARY KEY,
        meeting_id    INTEGER NOT NULL REFERENCES ${db_1.schemaName}.meetings(id) ON DELETE CASCADE,
        threshold_min INTEGER NOT NULL,
        channel       VARCHAR(50) DEFAULT 'in-app',
        fired_at      TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_alert UNIQUE (meeting_id, threshold_min, channel)
      )
    `);
        // Migrate existing alerts table
        await client.query(`
      ALTER TABLE ${db_1.schemaName}.alerts
        ADD COLUMN IF NOT EXISTS meeting_id    INTEGER REFERENCES ${db_1.schemaName}.meetings(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS threshold_min INTEGER,
        ADD COLUMN IF NOT EXISTS channel       VARCHAR(50) DEFAULT 'in-app',
        ADD COLUMN IF NOT EXISTS fired_at      TIMESTAMPTZ DEFAULT NOW()
    `);
        console.log('✓ Table alerts');
        // ── 4. notifications ──────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${db_1.schemaName}.notifications (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES ${db_1.schemaName}.users(id) ON DELETE CASCADE,
        meeting_id  INTEGER REFERENCES ${db_1.schemaName}.meetings(id) ON DELETE SET NULL,
        message     TEXT NOT NULL,
        is_read     BOOLEAN DEFAULT FALSE,
        read_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
        // Migrate existing notifications table — add missing columns
        await client.query(`
      ALTER TABLE ${db_1.schemaName}.notifications
        ADD COLUMN IF NOT EXISTS user_id    INTEGER REFERENCES ${db_1.schemaName}.users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS meeting_id INTEGER REFERENCES ${db_1.schemaName}.meetings(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS is_read    BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS read_at    TIMESTAMPTZ
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON ${db_1.schemaName}.notifications(user_id, is_read)
    `);
        console.log('✓ Table notifications');
        // ── 5. conflicts ──────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${db_1.schemaName}.conflicts (
        id                     SERIAL PRIMARY KEY,
        user_id                INTEGER NOT NULL REFERENCES ${db_1.schemaName}.users(id) ON DELETE CASCADE,
        proposed_start         TIMESTAMPTZ NOT NULL,
        proposed_end           TIMESTAMPTZ NOT NULL,
        conflicting_meeting_id INTEGER NOT NULL REFERENCES ${db_1.schemaName}.meetings(id) ON DELETE CASCADE,
        detected_at            TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_conflict UNIQUE (user_id, proposed_start, proposed_end, conflicting_meeting_id)
      )
    `);
        console.log('✓ Table conflicts');
        // ── 6. briefings ──────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${db_1.schemaName}.briefings (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES ${db_1.schemaName}.users(id) ON DELETE CASCADE,
        brief_date  DATE NOT NULL,
        content     TEXT NOT NULL,     -- AI-generated markdown summary
        model       VARCHAR(50),       -- which Claude model generated it
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_briefing_date UNIQUE (user_id, brief_date)
      )
    `);
        console.log('✓ Table briefings');
        // ── 7. departments ────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${db_1.schemaName}.departments (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES ${db_1.schemaName}.users(id) ON DELETE CASCADE,
        name       VARCHAR(100) NOT NULL,   -- e.g. "CSE"
        hod_name   VARCHAR(100),
        hod_email  VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_dept UNIQUE (user_id, name)
      )
    `);
        console.log('✓ Table departments');
        // ── 8. emails ─────────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${db_1.schemaName}.emails (
        id                 SERIAL PRIMARY KEY,
        user_id            INTEGER REFERENCES ${db_1.schemaName}.users(id) ON DELETE CASCADE,
        gmail_message_id   VARCHAR(255),
        from_address       TEXT,
        subject            TEXT,
        snippet            TEXT,
        body               TEXT,
        received_at        TIMESTAMPTZ,
        department         VARCHAR(100),
        meeting_links      TEXT[],
        extracted_time     TIMESTAMPTZ,
        parsed_meeting_id  INTEGER REFERENCES ${db_1.schemaName}.meetings(id) ON DELETE SET NULL,
        created_at         TIMESTAMPTZ DEFAULT NOW()
      )
    `);
        // Migrate existing emails table
        await client.query(`
      ALTER TABLE ${db_1.schemaName}.emails
        ADD COLUMN IF NOT EXISTS user_id           INTEGER REFERENCES ${db_1.schemaName}.users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS gmail_message_id  VARCHAR(255),
        ADD COLUMN IF NOT EXISTS snippet           TEXT,
        ADD COLUMN IF NOT EXISTS body              TEXT,
        ADD COLUMN IF NOT EXISTS received_at       TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS department        VARCHAR(100),
        ADD COLUMN IF NOT EXISTS meeting_links     TEXT[],
        ADD COLUMN IF NOT EXISTS extracted_time    TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS parsed_meeting_id INTEGER REFERENCES ${db_1.schemaName}.meetings(id) ON DELETE SET NULL
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_emails_user_received
        ON ${db_1.schemaName}.emails(user_id, received_at DESC)
    `);
        console.log('✓ Table emails');
        // ── 9. jobs (BullMQ audit trail, Phase 3) ────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS ${db_1.schemaName}.jobs (
        id         SERIAL PRIMARY KEY,
        queue      VARCHAR(100) NOT NULL,
        bull_job_id VARCHAR(255),
        status     VARCHAR(50) DEFAULT 'pending',  -- pending|active|completed|failed
        payload    JSONB,
        result     JSONB,
        error      TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
        console.log('✓ Table jobs');
        // ── 10. Seed default user ─────────────────────────────────────────────
        const defaultEmail = 'principal@gmail.com';
        const existing = await client.query(`SELECT id FROM ${db_1.schemaName}.users WHERE username = $1`, [defaultEmail]);
        if (existing.rows.length === 0) {
            const hashed = await bcryptjs_1.default.hash('123456', 10);
            await client.query(`INSERT INTO ${db_1.schemaName}.users (full_name, username, password)
         VALUES ($1, $2, $3)`, ['Principal User', defaultEmail, hashed]);
            console.log(`✓ Default user "${defaultEmail}" seeded (password: 123456)`);
        }
        else {
            console.log(`✓ Default user "${defaultEmail}" already exists`);
        }
        console.log('\n🎉 Database initialization complete — all 9 tables ready.\n');
    }
    catch (error) {
        console.error('❌ Error initializing database:', error);
        throw error;
    }
    finally {
        client.release();
        await db_1.default.end();
    }
}
initDb().catch(err => {
    console.error(err);
    process.exit(1);
});
