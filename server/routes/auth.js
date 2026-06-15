const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');

const router = express.Router();

// ── POST /api/auth/otp/request ──────────────────────────────────────
// Body: { phone: "9876543210" }
// What it does: generates a 4-digit code, stores it in the database
// for 10 minutes, and logs it to the console. (SMS comes later.)
router.post('/otp/request', async (req, res) => {
  const { phone } = req.body;

  if (!phone || String(phone).replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Please send a valid 10-digit phone number.' });
  }

  const cleanPhone = String(phone).replace(/\D/g, '');
  const code       = String(Math.floor(1000 + Math.random() * 9000));  // 4-digit
  const expiresAt  = new Date(Date.now() + 10 * 60 * 1000);            // 10 minutes from now

  try {
    // Store (or replace) the OTP — upsert so the same phone can retry
    await db.query(
      `INSERT INTO otp_tokens (phone, code, expires_at, attempts)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (phone) DO UPDATE
         SET code = $2, expires_at = $3, attempts = 0`,
      [cleanPhone, code, expiresAt]
    );

    // TODO: replace this console.log with a real SMS API (e.g. Twilio, MSG91)
    console.log(`\n📱  OTP for ${cleanPhone}: ${code}  (valid 10 min)\n`);

    res.json({ success: true, message: 'OTP sent. Check the server console for the code during testing.' });
  } catch (err) {
    console.error('otp/request error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ── POST /api/auth/otp/verify ───────────────────────────────────────
// Body: { phone: "9876543210", code: "4823" }
// What it does: checks the code, returns a token the frontend stores
// to stay logged in.
router.post('/otp/verify', async (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ error: 'Phone and code are required.' });
  }

  const cleanPhone = String(phone).replace(/\D/g, '');

  try {
    const result = await db.query(
      'SELECT code, expires_at, attempts FROM otp_tokens WHERE phone = $1',
      [cleanPhone]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No OTP was requested for this number. Please request a new one.' });
    }

    const row = result.rows[0];

    // Too many wrong tries?
    if (row.attempts >= 5) {
      await db.query('DELETE FROM otp_tokens WHERE phone = $1', [cleanPhone]);
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    // Expired?
    if (new Date() > new Date(row.expires_at)) {
      await db.query('DELETE FROM otp_tokens WHERE phone = $1', [cleanPhone]);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    // Wrong code? Increment attempts counter
    if (row.code !== String(code)) {
      await db.query('UPDATE otp_tokens SET attempts = attempts + 1 WHERE phone = $1', [cleanPhone]);
      return res.status(400).json({ error: 'Incorrect code. Please try again.' });
    }

    // ✅ Correct — delete OTP and issue a token
    await db.query('DELETE FROM otp_tokens WHERE phone = $1', [cleanPhone]);

    // Look up the resident
    const resident = await db.query(
      `SELECT r.id, r.full_name, r.role, f.flat_number
       FROM residents r
       JOIN flats f ON f.id = r.flat_id
       WHERE r.phone = $1`,
      [cleanPhone]
    );

    const user = resident.rows[0] || null;

    // Simple random token — good enough for now
    // (We'll upgrade to JWT later when permissions get more complex)
    const token = crypto.randomBytes(32).toString('hex');

    res.json({
      success: true,
      token,
      user: user
        ? { name: user.full_name, flat: user.flat_number, role: user.role }
        : { name: 'Resident', flat: 'Unknown', role: 'resident' },
    });
  } catch (err) {
    console.error('otp/verify error:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
