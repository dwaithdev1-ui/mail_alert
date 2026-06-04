import pool, { schemaName } from './db';
import bcrypt from 'bcryptjs';

async function initDb() {
  console.log('Initializing database…');
  console.log(`Schema: ${schemaName}`);

  const client = await pool.connect();
  try {
    // ── 0. Schema ─────────────────────────────────────────────────────────
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    console.log(`✓ Schema "${schemaName}"`);

    // ── 1. users ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.users (
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
      ALTER TABLE ${schemaName}.users
        ADD COLUMN IF NOT EXISTS google_token         TEXT,
        ADD COLUMN IF NOT EXISTS google_refresh_token TEXT
    `);
    console.log('✓ Table users');

    // ── 2. meetings ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.meetings (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
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
      ALTER TABLE ${schemaName}.meetings
        ADD COLUMN IF NOT EXISTS user_id       INTEGER REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS location      TEXT,
        ADD COLUMN IF NOT EXISTS description   TEXT,
        ADD COLUMN IF NOT EXISTS gcal_event_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS color_id      VARCHAR(10),
        ADD COLUMN IF NOT EXISTS source        VARCHAR(50) DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS status        VARCHAR(20) DEFAULT 'scheduled',
        ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();
        
      ALTER TABLE ${schemaName}.meetings
        DROP CONSTRAINT IF EXISTS uq_google_event_id;

      ALTER TABLE ${schemaName}.meetings
        ADD CONSTRAINT uq_google_event_id UNIQUE (google_event_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meetings_user_start
        ON ${schemaName}.meetings(user_id, start_time)
    `);
    console.log('✓ Table meetings');

    // ── 3. alerts ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.alerts (
        id            SERIAL PRIMARY KEY,
        meeting_id    INTEGER NOT NULL REFERENCES ${schemaName}.meetings(id) ON DELETE CASCADE,
        threshold_min INTEGER NOT NULL,
        channel       VARCHAR(50) DEFAULT 'in-app',
        fired_at      TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_alert UNIQUE (meeting_id, threshold_min, channel)
      )
    `);
    // Migrate existing alerts table
    await client.query(`
      ALTER TABLE ${schemaName}.alerts
        ADD COLUMN IF NOT EXISTS meeting_id    INTEGER REFERENCES ${schemaName}.meetings(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS threshold_min INTEGER,
        ADD COLUMN IF NOT EXISTS channel       VARCHAR(50) DEFAULT 'in-app',
        ADD COLUMN IF NOT EXISTS fired_at      TIMESTAMPTZ DEFAULT NOW()
    `);
    console.log('✓ Table alerts');

    // ── 4. notifications ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.notifications (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
        meeting_id  INTEGER REFERENCES ${schemaName}.meetings(id) ON DELETE SET NULL,
        message     TEXT NOT NULL,
        is_read     BOOLEAN DEFAULT FALSE,
        read_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Migrate existing notifications table — add missing columns
    await client.query(`
      ALTER TABLE ${schemaName}.notifications
        ADD COLUMN IF NOT EXISTS user_id    INTEGER REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS meeting_id INTEGER REFERENCES ${schemaName}.meetings(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS is_read    BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS read_at    TIMESTAMPTZ
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON ${schemaName}.notifications(user_id, is_read)
    `);
    console.log('✓ Table notifications');

    // ── 5. conflicts ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.conflicts (
        id                     SERIAL PRIMARY KEY,
        user_id                INTEGER NOT NULL REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
        proposed_start         TIMESTAMPTZ NOT NULL,
        proposed_end           TIMESTAMPTZ NOT NULL,
        conflicting_meeting_id INTEGER NOT NULL REFERENCES ${schemaName}.meetings(id) ON DELETE CASCADE,
        detected_at            TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_conflict UNIQUE (user_id, proposed_start, proposed_end, conflicting_meeting_id)
      )
    `);
    console.log('✓ Table conflicts');

    // ── 6. briefings ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.briefings (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
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
      CREATE TABLE IF NOT EXISTS ${schemaName}.departments (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
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
      CREATE TABLE IF NOT EXISTS ${schemaName}.emails (
        id                 SERIAL PRIMARY KEY,
        user_id            INTEGER REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
        gmail_message_id   VARCHAR(255),
        from_address       TEXT,
        subject            TEXT,
        snippet            TEXT,
        body               TEXT,
        received_at        TIMESTAMPTZ,
        department         VARCHAR(100),
        meeting_links      TEXT[],
        extracted_time     TIMESTAMPTZ,
        parsed_meeting_id  INTEGER REFERENCES ${schemaName}.meetings(id) ON DELETE SET NULL,
        created_at         TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Migrate existing emails table
    await client.query(`
      ALTER TABLE ${schemaName}.emails
        ADD COLUMN IF NOT EXISTS user_id           INTEGER REFERENCES ${schemaName}.users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS gmail_message_id  VARCHAR(255),
        ADD COLUMN IF NOT EXISTS snippet           TEXT,
        ADD COLUMN IF NOT EXISTS body              TEXT,
        ADD COLUMN IF NOT EXISTS received_at       TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS department        VARCHAR(100),
        ADD COLUMN IF NOT EXISTS meeting_links     TEXT[],
        ADD COLUMN IF NOT EXISTS extracted_time    TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS parsed_meeting_id INTEGER REFERENCES ${schemaName}.meetings(id) ON DELETE SET NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_emails_user_received
        ON ${schemaName}.emails(user_id, received_at DESC)
    `);
    console.log('✓ Table emails');

    // ── 9. jobs (BullMQ audit trail, Phase 3) ────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.jobs (
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
    const existing = await client.query(
      `SELECT id FROM ${schemaName}.users WHERE username = $1`,
      [defaultEmail]
    );
    if (existing.rows.length === 0) {
      const hashed = await bcrypt.hash('123456', 10);
      await client.query(
        `INSERT INTO ${schemaName}.users (full_name, username, password)
         VALUES ($1, $2, $3)`,
        ['Principal User', defaultEmail, hashed]
      );
      console.log(`✓ Default user "${defaultEmail}" seeded (password: 123456)`);
    } else {
      console.log(`✓ Default user "${defaultEmail}" already exists`);
    }

    console.log('\n🎉 Database initialization complete — all 9 tables ready.\n');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

initDb().catch(err => {
  console.error(err);
  process.exit(1);
});
