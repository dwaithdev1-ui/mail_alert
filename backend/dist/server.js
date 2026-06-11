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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const db_1 = __importStar(require("./db"));
const checkMeetings_1 = require("./checkMeetings");
// Phase 1 routes
const meetings_1 = __importDefault(require("./routes/meetings"));
const alerts_1 = __importDefault(require("./routes/alerts"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const conflicts_1 = __importDefault(require("./routes/conflicts"));
// Phase 2 routes
const agent_1 = __importDefault(require("./routes/agent"));
const briefing_1 = __importDefault(require("./routes/briefing"));
// Phase 4 routes
const calendarSync_1 = __importDefault(require("./routes/calendarSync"));
const contacts_1 = __importDefault(require("./routes/contacts"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// ── Phase 1 API routes ───────────────────────────────────────────────────────
app.use('/api/meetings', meetings_1.default);
app.use('/api/alerts', alerts_1.default);
app.use('/api/notifications', notifications_1.default);
app.use('/api/conflicts', conflicts_1.default);
// ── Phase 2 API routes ───────────────────────────────────────────────────────
app.use('/api/agent', agent_1.default);
app.use('/api/briefing', briefing_1.default);
// ── Phase 4 API routes ───────────────────────────────────────────────────────
app.use('/api/calendar', calendarSync_1.default);
app.use('/api/contacts', contacts_1.default);
// ── Signup ────────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
    const { fullName, username, password } = req.body;
    if (!fullName || !username || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    try {
        const userCheck = await db_1.default.query(`SELECT id FROM ${db_1.schemaName}.users WHERE username = $1`, [username.trim()]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const insertResult = await db_1.default.query(`INSERT INTO ${db_1.schemaName}.users (full_name, username, password)
       VALUES ($1, $2, $3) RETURNING id, full_name, username`, [fullName.trim(), username.trim(), hashedPassword]);
        const newUser = insertResult.rows[0];
        return res.status(201).json({
            success: true,
            message: 'Account created successfully!',
            token: `token-${newUser.id}-${Date.now()}`,
            user: { id: newUser.id, name: newUser.full_name, email: newUser.username, isGoogleUser: false }
        });
    }
    catch (error) {
        console.error('Signup error:', error);
        return res.status(500).json({ error: 'Internal server error during registration' });
    }
});
// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    try {
        const userResult = await db_1.default.query(`SELECT * FROM ${db_1.schemaName}.users WHERE username = $1`, [username.trim()]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        const user = userResult.rows[0];
        const isPasswordMatch = await bcryptjs_1.default.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        return res.status(200).json({
            success: true,
            message: 'Logged in successfully!',
            token: `token-${user.id}-${Date.now()}`,
            user: { id: user.id, name: user.full_name, email: user.username, isGoogleUser: false }
        });
    }
    catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ error: 'Internal server error during login' });
    }
});
// ── Google OAuth → DB ─────────────────────────────────────────────────────────
// Creates or finds the user in our own DB so Google users get a real ID,
// can set a site-specific password, and have an editable username/display name.
app.post('/api/auth/google', async (req, res) => {
    const { email, name } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    try {
        let userResult = await db_1.default.query(`SELECT id, full_name, username FROM ${db_1.schemaName}.users WHERE username = $1`, [email.trim()]);
        let user;
        if (userResult.rows.length === 0) {
            // New Google user — store with a random placeholder password.
            // They can set a real site password later via /api/user/update.
            const placeholderPassword = await bcryptjs_1.default.hash((0, crypto_1.randomBytes)(32).toString('hex'), 10);
            const insertResult = await db_1.default.query(`INSERT INTO ${db_1.schemaName}.users (full_name, username, password)
         VALUES ($1, $2, $3) RETURNING id, full_name, username`, [name?.trim() || email.trim(), email.trim(), placeholderPassword]);
            user = insertResult.rows[0];
        }
        else {
            user = userResult.rows[0];
        }
        return res.status(200).json({
            success: true,
            token: `token-${user.id}-${Date.now()}`,
            user: { id: user.id, name: user.full_name, email: user.username, isGoogleUser: true }
        });
    }
    catch (error) {
        console.error('Google auth error:', error);
        return res.status(500).json({ error: 'Internal server error during Google auth' });
    }
});
// ── Update username / password ─────────────────────────────────────────────────
// Works for ALL users (local and Google OAuth). 
// Google users: email (login key) cannot be changed, but site password CAN be set.
app.post('/api/user/update', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    // Token format: token-{userId}-{timestamp}
    const parts = token.split('-');
    const userId = parseInt(parts[1], 10);
    if (parts[0] !== 'token' || isNaN(userId)) {
        return res.status(403).json({ error: 'Invalid token' });
    }
    const { username, password } = req.body;
    if (!username && !password) {
        return res.status(400).json({ error: 'Either username or password is required to update' });
    }
    try {
        const client = await db_1.default.connect();
        try {
            if (username) {
                // Ensure no other user already has this username (note: both $1 and $2 supplied)
                const userCheck = await client.query(`SELECT id FROM ${db_1.schemaName}.users WHERE username = $1 AND id != $2`, [username.trim(), userId]);
                if (userCheck.rows.length > 0) {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                await client.query(`UPDATE ${db_1.schemaName}.users SET username = $1 WHERE id = $2`, [username.trim(), userId]);
            }
            if (password) {
                const hashedPassword = await bcryptjs_1.default.hash(password, 10);
                await client.query(`UPDATE ${db_1.schemaName}.users SET password = $1 WHERE id = $2`, [hashedPassword, userId]);
            }
            const userResult = await client.query(`SELECT id, full_name, username FROM ${db_1.schemaName}.users WHERE id = $1`, [userId]);
            if (userResult.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            const u = userResult.rows[0];
            return res.status(200).json({
                success: true,
                message: 'Account updated successfully!',
                user: { id: u.id, name: u.full_name, email: u.username }
            });
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        console.error('Update error:', error);
        return res.status(500).json({ error: 'Internal server error during update' });
    }
});
// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', schema: db_1.schemaName });
});
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    (0, checkMeetings_1.startMeetingAlertScanner)();
});
