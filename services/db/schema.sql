CREATE TABLE idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL
);

CREATE TABLE sites (
    id VARCHAR(50) PRIMARY KEY,
    event_id VARCHAR(50) REFERENCES events(id),
    name VARCHAR(100) NOT NULL
);

CREATE TABLE rosters (
    id VARCHAR(50) PRIMARY KEY,
    site_id VARCHAR(50) REFERENCES sites(id),
    staff_name VARCHAR(100) NOT NULL
);

CREATE TABLE collection_records (
    id VARCHAR(50) PRIMARY KEY,
    event_id VARCHAR(50) REFERENCES events(id),
    weight_kg DECIMAL(10, 2) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL
);
