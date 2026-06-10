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
/**
 * GET /api/contacts
 * Returns all contacts for the logged-in user.
 */
router.get('/', async (req, res) => {
    try {
        const result = await db_1.default.query(`SELECT id, name, email, designation, department, created_at
       FROM ${db_1.schemaName}.contacts
       WHERE user_id = $1
       ORDER BY name ASC`, [req.userId]);
        return res.json({ success: true, contacts: result.rows });
    }
    catch (err) {
        console.error('GET /api/contacts error:', err);
        return res.status(500).json({ error: 'Failed to fetch contacts', details: err.message });
    }
});
/**
 * POST /api/contacts
 * Adds a new contact for the logged-in user.
 */
router.post('/', async (req, res) => {
    const { name, email, designation, department } = req.body;
    if (!name || !name.trim() || !email || !email.trim()) {
        return res.status(400).json({ error: 'Name and email are required' });
    }
    try {
        const result = await db_1.default.query(`INSERT INTO ${db_1.schemaName}.contacts (user_id, name, email, designation, department)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, email) DO UPDATE SET
         name = EXCLUDED.name,
         designation = EXCLUDED.designation,
         department = EXCLUDED.department
       RETURNING id, name, email, designation, department`, [req.userId, name.trim(), email.trim().toLowerCase(), designation?.trim() || null, department?.trim() || null]);
        return res.status(201).json({ success: true, contact: result.rows[0] });
    }
    catch (err) {
        console.error('POST /api/contacts error:', err);
        return res.status(500).json({ error: 'Failed to create contact', details: err.message });
    }
});
/**
 * DELETE /api/contacts/:id
 * Deletes a contact by ID.
 */
router.delete('/:id', async (req, res) => {
    const contactId = parseInt(req.params.id, 10);
    if (isNaN(contactId)) {
        return res.status(400).json({ error: 'Invalid contact ID' });
    }
    try {
        const result = await db_1.default.query(`DELETE FROM ${db_1.schemaName}.contacts
       WHERE id = $1 AND user_id = $2
       RETURNING id`, [contactId, req.userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Contact not found or unauthorized' });
        }
        return res.json({ success: true, message: 'Contact deleted successfully', deletedId: contactId });
    }
    catch (err) {
        console.error('DELETE /api/contacts error:', err);
        return res.status(500).json({ error: 'Failed to delete contact', details: err.message });
    }
});
exports.default = router;
