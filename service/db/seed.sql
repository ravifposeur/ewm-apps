-- ============================================================
-- EWM-Apps Seed Data (Rich Version)
-- Aligned with test users: organizer-a, organizer-b, crew-a, crew-b, admin-a, admin-b
-- IMPORTANT: evt_001 and evt_002 MUST stay — existing tests depend on them.
-- IMPORTANT: rost_budi MUST stay — daily-collections test depends on it.
-- ============================================================

-- ============================================================
-- 1. EVENTS
-- ============================================================
-- evt_001: owned by organizer-a (ACTIVE, primary test target)
-- evt_002: owned by organizer-b (ACTIVE, used for ownership test)
-- evt_003: owned by organizer-a (DRAFT, for state transition tests)
-- evt_004: owned by organizer-a (COMPLETED, for history/filtering tests)
INSERT INTO events (id, organizer_id, name, status, scheduled_date, target_weight, points_multiplier, bonus_multiplier)
VALUES
  ('evt_001', 'organizer-a', 'DWP 2026',          'active',    '2026-08-30', 100000, 0.5, 2.0),
  ('evt_002', 'organizer-b', 'Java Jazz 2026',    'active',    '2026-09-15',  50000, 0.5, 2.0),
  ('evt_003', 'organizer-a', 'Campus Fest 2026',  'draft',     '2026-11-10',  30000, 0.5, 1.5),
  ('evt_004', 'organizer-a', 'Pasar Malam Kemang', 'completed', '2026-07-20',  20000, 0.5, 2.0)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. SITES (titik kumpul)
-- ============================================================
INSERT INTO sites (id, event_id, area_name, description, status, latitude, longitude)
VALUES
  -- evt_001 sites
  ('site_a',  'evt_001', 'Panggung Utama',       'Karung ditaruh di belakang papan skor.',       'approved', -6.2189, 106.8024),
  ('site_a2', 'evt_001', 'Food Court',           'Dekat tenant makanan utama.',                  'approved', -6.2195, 106.8031),
  ('site_a3', 'evt_001', 'Pintu Timur',          'Dekat pintu keluar VIP.',                      'approved', -6.2202, 106.8020),
  -- evt_002 sites
  ('site_b',  'evt_002', 'Food Court',           'Area tenant makanan.',                         'approved', -6.2100, 106.8100),
  ('site_b2', 'evt_002', 'Main Stage Backstage', 'Belakang panggung utama.',                     'approved', -6.2105, 106.8105),
  -- evt_003 sites (draft, belum di-approve)
  ('site_c',  'evt_003', 'Lapangan A',           'Titik utama kampus.',                          'proposed', -6.2010, 106.8000)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. ROSTERS (pembagian tugas petugas)
-- ============================================================
-- crew_id HARUS match dengan subject di JWT untuk Layer 3 ownership check
INSERT INTO rosters (id, event_id, site_id, crew_id, crew_name, shift_start, shift_end)
VALUES
  -- evt_001 roster — primary test target
  ('rost_budi', 'evt_001', 'site_a',  'crew-a', 'Budi',  '2026-08-30T08:00:00+07:00', '2026-08-30T16:00:00+07:00'),
  ('rost_ani',  'evt_001', 'site_a2', 'crew-b', 'Ani',   '2026-08-30T16:00:00+07:00', '2026-08-30T23:00:00+07:00'),
  -- evt_002 roster
  ('rost_citra', 'evt_002', 'site_b', 'crew-a', 'Citra', '2026-09-15T08:00:00+07:00', '2026-09-15T16:00:00+07:00'),
  -- evt_004 roster (historical, completed event)
  ('rost_dewi', 'evt_004', 'site_a',  'crew-b', 'Dewi',  '2026-07-20T08:00:00+07:00', '2026-07-20T16:00:00+07:00')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. COLLECTION RECORDS (timbangan sampah)
-- ============================================================
-- NOTE: Total recorded untuk evt_001 = 8.000g (untuk deviation test).
--       Test "deviation-too-high" kirim 999.999g → deviation jauh > 10% → 422.
--       Test "success" kirim verifiedBreakdown yang total-nya dekat 8.000g.
INSERT INTO collection_records (event_id, roster_id, site_id, waste_type, weight, recorded_at, status)
VALUES
  -- evt_001 — data petugas Budi (crew-a), total 8.000g
  ('evt_001', 'rost_budi', 'site_a',  'ORGANIK',   5000, '2026-08-30T10:30:00+07:00', 'recorded'),
  ('evt_001', 'rost_budi', 'site_a',  'ANORGANIK', 3000, '2026-08-30T11:00:00+07:00', 'recorded'),

  -- evt_002 — data petugas Citra (crew-a)
  ('evt_002', 'rost_citra', 'site_b',  'ORGANIK',   4000, '2026-09-15T10:00:00+07:00', 'recorded'),
  ('evt_002', 'rost_citra', 'site_b',  'ANORGANIK', 2000, '2026-09-15T11:30:00+07:00', 'recorded'),
  ('evt_002', 'rost_citra', 'site_b',  'RESIDU',     500, '2026-09-15T13:00:00+07:00', 'recorded'),

  -- evt_004 — data historis (event completed)
  ('evt_004', 'rost_dewi',  'site_a',  'ORGANIK',   8000, '2026-07-20T10:00:00+07:00', 'verified'),
  ('evt_004', 'rost_dewi',  'site_a',  'ANORGANIK', 6000, '2026-07-20T11:00:00+07:00', 'verified'),
  ('evt_004', 'rost_dewi',  'site_a',  'HAZMAT',     500, '2026-07-20T12:00:00+07:00', 'verified')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. SANITY CHECKS (opsional — untuk verifikasi manual)
-- ============================================================
-- Cek total recorded evt_001 (harus 8000):
--   SELECT SUM(weight) FROM collection_records WHERE event_id = 'evt_001';
--
-- Cek semua events per organizer:
--   SELECT organizer_id, COUNT(*) FROM events GROUP BY organizer_id;
--
-- Cek rosters per crew:
--   SELECT crew_id, COUNT(*) FROM rosters GROUP BY crew_id;
