-- Seed data aligned with test users (organizer-a, crew-a, admin-a)
INSERT INTO events (id, organizer_id, name, status, target_weight, points_multiplier, bonus_multiplier)
VALUES
  ('evt_001', 'organizer-a', 'DWP 2026', 'active', 100000, 0.5, 2.0),
  ('evt_002', 'organizer-b', 'Java Jazz 2026', 'active', 50000, 0.5, 2.0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sites (id, event_id, area_name, status)
VALUES
  ('site_a', 'evt_001', 'Panggung Utama', 'approved'),
  ('site_b', 'evt_002', 'Food Court', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rosters (id, event_id, site_id, crew_id, crew_name, shift_start, shift_end)
VALUES
  ('rost_budi', 'evt_001', 'site_a', 'crew-a', 'Budi',
    '2026-08-30T08:00:00+07:00', '2026-08-30T16:00:00+07:00')
ON CONFLICT (id) DO NOTHING;
