const express = require('express');
const db      = require('../db');
const router  = express.Router();

// Middleware: only residents with role='admin' may use these routes
async function requireAdmin(req, res, next) {
  const phone = req.headers['x-phone'];
  if (!phone) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const result = await db.query(
      `SELECT role FROM residents WHERE phone = $1`,
      [phone]
    );
    if (!result.rows[0] || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth check failed.' });
  }
}

router.use(requireAdmin);

// ── NOTICES ────────────────────────────────────────────────────────

router.get('/notices', async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, subtitle, posted_by, posted_at, is_active
       FROM notices ORDER BY posted_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notices', async (req, res) => {
  const { title, subtitle, posted_by } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  try {
    const result = await db.query(
      `INSERT INTO notices (title, subtitle, posted_by) VALUES ($1, $2, $3) RETURNING *`,
      [title, subtitle || '', posted_by || 'Committee']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/notices/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM notices WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── COMPLAINTS ─────────────────────────────────────────────────────

router.get('/complaints', async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT c.id, c.ref, c.category, c.title, c.status, c.assigned_to,
              c.created_at, c.resolved_at, f.flat_number
       FROM complaints c
       JOIN flats f ON f.id = c.flat_id
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/complaints/:id', async (req, res) => {
  const { status, assigned_to } = req.body;
  try {
    const result = await db.query(
      `UPDATE complaints
       SET status      = COALESCE($1, status),
           assigned_to = COALESCE($2, assigned_to),
           resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE resolved_at END
       WHERE id = $3 RETURNING *`,
      [status || null, assigned_to || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RESIDENTS ──────────────────────────────────────────────────────

router.get('/residents', async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT r.id, r.full_name, r.phone, r.role, r.created_at, f.flat_number
       FROM residents r
       JOIN flats f ON f.id = r.flat_id
       ORDER BY f.flat_number, r.full_name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/residents', async (req, res) => {
  const { flat_number, full_name, phone, role } = req.body;
  if (!flat_number || !full_name || !phone) {
    return res.status(400).json({ error: 'flat_number, full_name and phone are required.' });
  }
  const cleanPhone = String(phone).replace(/\D/g, '');
  if (cleanPhone.length !== 10) {
    return res.status(400).json({ error: 'Phone must be exactly 10 digits.' });
  }
  try {
    // Find or create the flat
    let flatRes = await db.query(`SELECT id FROM flats WHERE flat_number = $1`, [flat_number]);
    let flatId;
    if (flatRes.rows.length === 0) {
      const tower = flat_number.split('-')[0] || 'A';
      const ins = await db.query(
        `INSERT INTO flats (flat_number, tower) VALUES ($1, $2) RETURNING id`,
        [flat_number, tower]
      );
      flatId = ins.rows[0].id;
    } else {
      flatId = flatRes.rows[0].id;
    }
    const result = await db.query(
      `INSERT INTO residents (flat_id, full_name, phone, role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [flatId, full_name, cleanPhone, role === 'admin' ? 'admin' : 'resident']
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That phone number is already registered.' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/residents/:id', async (req, res) => {
  try {
    await db.query(`DELETE FROM residents WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DUES ───────────────────────────────────────────────────────────

router.get('/dues', async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT d.id, d.amount, d.due_date, d.period, d.status, d.paid_at, f.flat_number
       FROM maintenance_dues d
       JOIN flats f ON f.id = d.flat_id
       ORDER BY d.due_date DESC, f.flat_number`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/dues', async (req, res) => {
  const { flat_number, amount, due_date, period } = req.body;
  if (!flat_number || !amount || !due_date) {
    return res.status(400).json({ error: 'flat_number, amount and due_date are required.' });
  }
  try {
    const flatRes = await db.query(`SELECT id FROM flats WHERE flat_number = $1`, [flat_number]);
    if (flatRes.rows.length === 0) return res.status(404).json({ error: `Flat ${flat_number} not found.` });
    const result = await db.query(
      `INSERT INTO maintenance_dues (flat_id, amount, due_date, period) VALUES ($1, $2, $3, $4) RETURNING *`,
      [flatRes.rows[0].id, amount, due_date, period || '']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/dues/:id/pay', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE maintenance_dues SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FLATS (for dropdowns) ──────────────────────────────────────────

router.get('/flats', async (_req, res) => {
  try {
    const result = await db.query(`SELECT id, flat_number, tower FROM flats ORDER BY flat_number`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
