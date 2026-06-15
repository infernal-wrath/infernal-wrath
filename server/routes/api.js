const express = require('express');
const db      = require('../db');
const router  = express.Router();

// Helper: look up a resident + flat from the X-Phone header
async function residentByPhone(phone) {
  if (!phone) return null;
  const result = await db.query(
    `SELECT r.id AS resident_id, r.flat_id, f.flat_number
     FROM residents r
     JOIN flats f ON f.id = r.flat_id
     WHERE r.phone = $1`,
    [phone]
  );
  return result.rows[0] || null;
}

// ── GET /api/notices ────────────────────────────────────────────────
// Public — no auth needed.
router.get('/notices', async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, subtitle, posted_by, posted_at
       FROM notices WHERE is_active = true
       ORDER BY posted_at DESC LIMIT 5`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('notices error:', err.message);
    res.status(500).json({ error: 'Could not load notices.' });
  }
});

// ── GET /api/dues ───────────────────────────────────────────────────
// Header: X-Phone
// Returns the next pending due for the caller's flat, or { allPaid: true }
router.get('/dues', async (req, res) => {
  const resident = await residentByPhone(req.headers['x-phone']).catch(() => null);
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });

  try {
    const result = await db.query(
      `SELECT id, amount, due_date, period, status
       FROM maintenance_dues
       WHERE flat_id = $1 AND status = 'pending'
       ORDER BY due_date ASC LIMIT 1`,
      [resident.flat_id]
    );
    if (result.rows.length === 0) return res.json({ allPaid: true });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('dues error:', err.message);
    res.status(500).json({ error: 'Could not load dues.' });
  }
});

// ── POST /api/amenities/book ────────────────────────────────────────
// Header: X-Phone
// Body: { amenityKey, amenityName, slotDate, slotTime, fee }
router.post('/amenities/book', async (req, res) => {
  const resident = await residentByPhone(req.headers['x-phone']).catch(() => null);
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });

  const { amenityKey, amenityName, slotDate, slotTime, fee } = req.body;
  if (!amenityKey || !slotDate || !slotTime) {
    return res.status(400).json({ error: 'amenityKey, slotDate and slotTime are required.' });
  }

  try {
    // Check the slot isn't already taken
    const clash = await db.query(
      `SELECT id FROM amenity_bookings
       WHERE amenity_key = $1 AND slot_date = $2 AND slot_time = $3 AND status = 'confirmed'`,
      [amenityKey, slotDate, slotTime]
    );
    if (clash.rows.length > 0) {
      return res.status(409).json({ error: 'This slot is already booked. Please choose another time.' });
    }

    // Generate a sequential reference number
    const count = await db.query('SELECT COUNT(*) FROM amenity_bookings');
    const ref   = 'JH-B-' + String(Number(count.rows[0].count) + 1).padStart(4, '0');

    await db.query(
      `INSERT INTO amenity_bookings (flat_id, amenity_key, amenity_name, slot_date, slot_time, fee, ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [resident.flat_id, amenityKey, amenityName || amenityKey, slotDate, slotTime, fee || 0, ref]
    );

    res.json({ success: true, ref });
  } catch (err) {
    console.error('book error:', err.message);
    res.status(500).json({ error: 'Booking failed. Please try again.' });
  }
});

// ── GET /api/amenities/bookings ─────────────────────────────────────
// Header: X-Phone
// Returns upcoming confirmed bookings for the caller's flat
router.get('/amenities/bookings', async (req, res) => {
  const resident = await residentByPhone(req.headers['x-phone']).catch(() => null);
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });

  try {
    const result = await db.query(
      `SELECT id, amenity_key, amenity_name, slot_date, slot_time, fee, ref, status
       FROM amenity_bookings
       WHERE flat_id = $1 AND status = 'confirmed' AND slot_date >= CURRENT_DATE
       ORDER BY slot_date ASC, slot_time ASC LIMIT 5`,
      [resident.flat_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('bookings error:', err.message);
    res.status(500).json({ error: 'Could not load bookings.' });
  }
});

// ── POST /api/complaints ────────────────────────────────────────────
// Header: X-Phone
// Body: { category, title, description }
router.post('/complaints', async (req, res) => {
  const resident = await residentByPhone(req.headers['x-phone']).catch(() => null);
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });

  const { category, title, description } = req.body;
  if (!category || !title) {
    return res.status(400).json({ error: 'Category and title are required.' });
  }

  try {
    const count = await db.query('SELECT COUNT(*) FROM complaints');
    const ref   = 'JH-2026-' + String(Number(count.rows[0].count) + 1).padStart(6, '0');

    await db.query(
      `INSERT INTO complaints (flat_id, category, title, description, ref)
       VALUES ($1, $2, $3, $4, $5)`,
      [resident.flat_id, category, title, description || '', ref]
    );

    res.json({ success: true, ref });
  } catch (err) {
    console.error('complaint error:', err.message);
    res.status(500).json({ error: 'Could not submit complaint. Please try again.' });
  }
});

// ── GET /api/complaints ─────────────────────────────────────────────
// Header: X-Phone
// Returns all complaints for the caller's flat, newest first
router.get('/complaints', async (req, res) => {
  const resident = await residentByPhone(req.headers['x-phone']).catch(() => null);
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });

  try {
    const result = await db.query(
      `SELECT id, category, title, description, status, ref, assigned_to, created_at, resolved_at
       FROM complaints
       WHERE flat_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [resident.flat_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('complaints error:', err.message);
    res.status(500).json({ error: 'Could not load complaints.' });
  }
});

module.exports = router;
