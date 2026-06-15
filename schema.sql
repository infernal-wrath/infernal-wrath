-- ============================================================
--  Jubilee Hills Connect — database schema
--  Paste this into Supabase → SQL Editor → Run
-- ============================================================

-- Flats in the society
CREATE TABLE IF NOT EXISTS flats (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_number text NOT NULL UNIQUE,   -- e.g. 'A-1203'
  tower       text NOT NULL,          -- 'A', 'B', 'C' …
  floor       int,
  status      text NOT NULL DEFAULT 'occupied'  -- 'occupied' | 'vacant'
);

-- People who live here (one flat can have multiple residents)
CREATE TABLE IF NOT EXISTS residents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id     uuid REFERENCES flats(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  phone       text NOT NULL UNIQUE,
  role        text NOT NULL DEFAULT 'resident',  -- 'resident' | 'admin'
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Short-lived OTP codes (cleaned up after use or expiry)
CREATE TABLE IF NOT EXISTS otp_tokens (
  phone       text PRIMARY KEY,
  code        text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    int NOT NULL DEFAULT 0
);

-- Maintenance dues per flat per quarter
CREATE TABLE IF NOT EXISTS maintenance_dues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id     uuid REFERENCES flats(id) ON DELETE CASCADE,
  amount      numeric(10,2) NOT NULL,
  due_date    date NOT NULL,
  period      text,                   -- 'June 2026'
  paid_at     timestamptz,
  status      text NOT NULL DEFAULT 'pending'  -- 'pending' | 'paid'
);

-- Amenity bookings (gym, pool, hall, etc.)
CREATE TABLE IF NOT EXISTS amenity_bookings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id      uuid REFERENCES flats(id) ON DELETE CASCADE,
  amenity_key  text NOT NULL,         -- 'ac0' = Multipurpose Hall, 'ac1' = Party Place, etc.
  amenity_name text NOT NULL,
  slot_date    date NOT NULL,
  slot_time    text NOT NULL,         -- '06:00–07:00'
  fee          numeric(10,2) NOT NULL DEFAULT 0,
  ref          text NOT NULL UNIQUE,  -- 'JH-B-0043'
  status       text NOT NULL DEFAULT 'confirmed',  -- 'confirmed' | 'cancelled'
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Visitor passes issued by residents
CREATE TABLE IF NOT EXISTS visitor_passes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id        uuid REFERENCES flats(id) ON DELETE CASCADE,
  visitor_name   text NOT NULL,
  visitor_phone  text,
  gate           text NOT NULL,        -- 'main' | 'back' | 'side'
  valid_from     text NOT NULL,        -- '14:00'
  valid_until    text NOT NULL,        -- '18:00'
  ref            text NOT NULL UNIQUE, -- 'JH-PASS-0001'
  status         text NOT NULL DEFAULT 'active',  -- 'active' | 'expired' | 'used'
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Deliveries waiting at the gate
CREATE TABLE IF NOT EXISTS deliveries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id      uuid REFERENCES flats(id) ON DELETE CASCADE,
  vendor_name  text NOT NULL,          -- 'Zomato', 'Amazon', 'BigBasket'
  icon         text,                   -- emoji '🍔'
  gate         text NOT NULL DEFAULT 'main',
  arrived_at   timestamptz NOT NULL DEFAULT now(),
  collected_at timestamptz,
  status       text NOT NULL DEFAULT 'pending'  -- 'pending' | 'collected'
);

-- Help desk / complaints
CREATE TABLE IF NOT EXISTS complaints (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id      uuid REFERENCES flats(id) ON DELETE CASCADE,
  category     text NOT NULL,          -- 'plumbing' | 'electrical' | 'lift' | 'housekeeping' | 'security' | 'other'
  title        text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'open',  -- 'open' | 'in_progress' | 'resolved' | 'escalated'
  ref          text NOT NULL UNIQUE,   -- 'JH-2026-000232'
  assigned_to  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

-- Notice board posts
CREATE TABLE IF NOT EXISTS notices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  subtitle   text,
  posted_by  text,
  posted_at  timestamptz NOT NULL DEFAULT now(),
  is_active  boolean NOT NULL DEFAULT true
);

-- ── Seed data — a handful of flats and one admin so you can log in ──

INSERT INTO flats (flat_number, tower, floor) VALUES
  ('A-1201', 'A', 12),
  ('A-1202', 'A', 12),
  ('A-1203', 'A', 12),
  ('B-0301', 'B', 3),
  ('B-0302', 'B', 3)
ON CONFLICT DO NOTHING;

INSERT INTO residents (flat_id, full_name, phone, role, is_primary)
SELECT id, 'Shriram Munde', '9999900000', 'admin', true
FROM flats WHERE flat_number = 'A-1203'
ON CONFLICT DO NOTHING;

INSERT INTO notices (title, subtitle, posted_by) VALUES
  ('Water tanker — Tower A, 2 PM', 'Supply maintenance · committee', 'Committee'),
  ('Ganeshotsav planning meet', 'Clubhouse · Sat 7 PM', 'Secretary'),
  ('Pool reopens after cleaning', '6 AM – 9 PM slots open', 'Facility team')
ON CONFLICT DO NOTHING;
