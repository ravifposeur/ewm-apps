-- ============================================================
-- EWM-Apps Core Service — Database Schema
-- Aligned with openapi.yaml v0.2.0
-- ============================================================

-- 1. Events (no FK)
CREATE TABLE events (
  id VARCHAR(50) PRIMARY KEY,
  organizer_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','verifying','completed')),
  scheduled_date DATE,
  target_weight INTEGER,
  points_multiplier DECIMAL(10,2) DEFAULT 0.5,
  bonus_multiplier DECIMAL(10,2) DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Sites (FK → events)
CREATE TABLE sites (
  id VARCHAR(50) PRIMARY KEY,
  event_id VARCHAR(50) REFERENCES events(id) ON DELETE CASCADE,
  area_name VARCHAR(100) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'proposed'
    CHECK (status IN ('proposed','approved','rejected')),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8)
);

-- 3. Rosters (FK → events, sites)
CREATE TABLE rosters (
  id VARCHAR(50) PRIMARY KEY,
  event_id VARCHAR(50) REFERENCES events(id) ON DELETE CASCADE,
  site_id VARCHAR(50) REFERENCES sites(id),
  crew_id VARCHAR(50) NOT NULL,
  crew_name VARCHAR(100) NOT NULL,
  shift_start TIMESTAMP WITH TIME ZONE,
  shift_end TIMESTAMP WITH TIME ZONE
);

-- 4. Collection records (FK → events, rosters, sites)
CREATE TABLE collection_records (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(50) REFERENCES events(id) ON DELETE CASCADE,
  roster_id VARCHAR(50) REFERENCES rosters(id),
  site_id VARCHAR(50) REFERENCES sites(id),
  waste_type VARCHAR(20) NOT NULL
    CHECK (waste_type IN ('ORGANIK','ANORGANIK','RESIDU','HAZMAT')),
  weight INTEGER NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'recorded'
);

-- 5. Idempotency keys (no FK)
CREATE TABLE idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  body_hash VARCHAR(255) NOT NULL,
  response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
