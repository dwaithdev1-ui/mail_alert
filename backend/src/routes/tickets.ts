import express, { Request, Response } from 'express';
import multer from 'multer';
import pool, { schemaName } from '../db';
import { sendTicketEmail } from '../utils/email';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const uploadDir = path.resolve(__dirname, '../../uploads/tickets');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const unique = `${Date.now()}-${file.originalname}`;
    cb(null, unique);
  },
});
const upload = multer({ storage, limits: { fileSize: Number(process.env.MAX_ATTACHMENT_SIZE) || 5 * 1024 * 1024 } });

// Helper to insert audit record
async function logAudit(ticketId: number, action: string, actorId: number, detail?: any) {
  await pool.query(
    `INSERT INTO ${schemaName}.ticket_audit (ticket_id, action, actor_user_id, detail) VALUES ($1, $2, $3, $4)`,
    [ticketId, action, actorId, detail ? JSON.stringify(detail) : null]
  );
}

// CREATE ticket
router.post('/', upload.array('attachments'), async (req: Request, res: Response) => {
  const { title, description, priority, assigned_to } = req.body;
  const creatorId = Number(req.headers['x-user-id']) || 0; // simplistic auth placeholder
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO ${schemaName}.tickets (title, description, priority, created_by, assigned_to) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [title, description, priority || 'medium', creatorId, assigned_to || null]
      );
      const ticketId = result.rows[0].id;
      // Handle attachments
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          await client.query(
            `INSERT INTO ${schemaName}.ticket_attachments (ticket_id, filename, filepath) VALUES ($1, $2, $3)`,
            [ticketId, file.originalname, file.filename]
          );
        }
      }
      await logAudit(ticketId, 'create', creatorId);
      // Send notification email to assignee if present
      if (assigned_to) {
        const assigneeRes = await client.query(`SELECT username FROM ${schemaName}.users WHERE id = $1`, [assigned_to]);
        if (assigneeRes.rows.length) {
          const email = assigneeRes.rows[0].username;
          await sendTicketEmail(email, `New Ticket Assigned: ${title}`, `<p>A new ticket has been assigned to you.</p>`);
        }
      }
      res.status(201).json({ id: ticketId, message: 'Ticket created' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Ticket create error:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// READ list with filters
router.get('/', async (req: Request, res: Response) => {
  const { status, priority, assigned_to, created_by, from, to } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
  if (priority) { conditions.push(`priority = $${idx++}`); params.push(priority); }
  if (assigned_to) { conditions.push(`assigned_to = $${idx++}`); params.push(assigned_to); }
  if (created_by) { conditions.push(`created_by = $${idx++}`); params.push(created_by); }
  if (from) { conditions.push(`created_at >= $${idx++}`); params.push(new Date(from as string)); }
  if (to) { conditions.push(`created_at <= $${idx++}`); params.push(new Date(to as string)); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const query = `SELECT * FROM ${schemaName}.tickets ${where} ORDER BY created_at DESC`;
  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Ticket list error:', err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// READ single ticket + attachments
router.get('/:id', async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  try {
    const ticketRes = await pool.query(`SELECT * FROM ${schemaName}.tickets WHERE id = $1`, [ticketId]);
    if (!ticketRes.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    const attachmentsRes = await pool.query(`SELECT id, filename, filepath FROM ${schemaName}.ticket_attachments WHERE ticket_id = $1`, [ticketId]);
    res.json({ ...ticketRes.rows[0], attachments: attachmentsRes.rows });
  } catch (err) {
    console.error('Ticket get error:', err);
    res.status(500).json({ error: 'Failed to get ticket' });
  }
});

// UPDATE ticket
router.put('/:id', async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  const { title, description, status, priority, assigned_to } = req.body;
  const actorId = Number(req.headers['x-user-id']) || 0;
  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;
  if (title) { fields.push(`title = $${idx++}`); params.push(title); }
  if (description) { fields.push(`description = $${idx++}`); params.push(description); }
  if (status) { fields.push(`status = $${idx++}`); params.push(status); }
  if (priority) { fields.push(`priority = $${idx++}`); params.push(priority); }
  if (assigned_to) { fields.push(`assigned_to = $${idx++}`); params.push(assigned_to); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  const setClause = fields.join(', ');
  params.push(ticketId);
  try {
    await pool.query(`UPDATE ${schemaName}.tickets SET ${setClause}, updated_at = NOW() WHERE id = $${idx}`, params);
    await logAudit(ticketId, 'update', actorId, req.body);
    res.json({ message: 'Ticket updated' });
  } catch (err) {
    console.error('Ticket update error:', err);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// DELETE ticket
router.delete('/:id', async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  const actorId = Number(req.headers['x-user-id']) || 0;
  try {
    await pool.query(`DELETE FROM ${schemaName}.ticket_attachments WHERE ticket_id = $1`, [ticketId]);
    await pool.query(`DELETE FROM ${schemaName}.tickets WHERE id = $1`, [ticketId]);
    await logAudit(ticketId, 'delete', actorId);
    res.json({ message: 'Ticket deleted' });
  } catch (err) {
    console.error('Ticket delete error:', err);
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
});

export default router;
