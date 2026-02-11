-- Database schema for Delegate Voting Indexer
-- Run this in Supabase SQL Editor to create the tables

-- Epochs table
CREATE TABLE IF NOT EXISTS epochs (
    epoch_id INTEGER PRIMARY KEY,
    start_timestamp BIGINT NOT NULL,
    vote_start_timestamp BIGINT NOT NULL,
    vote_end_timestamp BIGINT NOT NULL,
    snapshot_timestamp BIGINT NOT NULL,
    total_votes TEXT NOT NULL, -- Store as text for bigint precision
    is_finalized BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gauges table
CREATE TABLE IF NOT EXISTS gauges (
    gauge_address VARCHAR(42) PRIMARY KEY,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT NOT NULL,
    metadata_uri TEXT
);

-- Insert known gauges
INSERT INTO gauges (gauge_address, is_active, created_at) VALUES
    ('0x0000000000000000000000000000000000000001', true, 0),
    ('0x0000000000000000000000000000000000000002', true, 0),
    ('0x0000000000000000000000000000000000000003', true, 0)
ON CONFLICT (gauge_address) DO NOTHING;

-- Votes table (per delegate per gauge per epoch)
CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    epoch_id INTEGER REFERENCES epochs(epoch_id) ON DELETE CASCADE,
    delegate_address VARCHAR(42) NOT NULL,
    gauge_address VARCHAR(42) REFERENCES gauges(gauge_address),
    voting_power_used TEXT NOT NULL, -- Store as text for bigint precision
    votes_cast TEXT NOT NULL,
    weight_percentage NUMERIC(5, 2) NOT NULL,
    voted_at_timestamp BIGINT NOT NULL,
    voted_at_block BIGINT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    UNIQUE(epoch_id, delegate_address, gauge_address)
);

-- Delegations table (state at each epoch snapshot)
CREATE TABLE IF NOT EXISTS delegations (
    id SERIAL PRIMARY KEY,
    epoch_id INTEGER REFERENCES epochs(epoch_id) ON DELETE CASCADE,
    delegator_address VARCHAR(42) NOT NULL,
    delegate_address VARCHAR(42) NOT NULL,
    token_ids INTEGER[] NOT NULL DEFAULT '{}',
    total_voting_power TEXT NOT NULL,
    snapshot_timestamp BIGINT NOT NULL,
    UNIQUE(epoch_id, delegator_address)
);

-- Contributions table (the main output)
CREATE TABLE IF NOT EXISTS contributions (
    id SERIAL PRIMARY KEY,
    epoch_id INTEGER REFERENCES epochs(epoch_id) ON DELETE CASCADE,
    delegator_address VARCHAR(42) NOT NULL,
    delegate_address VARCHAR(42) NOT NULL,
    gauge_address VARCHAR(42) REFERENCES gauges(gauge_address),
    delegator_voting_power TEXT NOT NULL,
    contribution_amount TEXT NOT NULL,
    contribution_percentage NUMERIC(10, 6) NOT NULL,
    UNIQUE(epoch_id, delegator_address, gauge_address)
);

-- Epoch gauge totals (aggregate view)
CREATE TABLE IF NOT EXISTS epoch_gauge_totals (
    epoch_id INTEGER REFERENCES epochs(epoch_id) ON DELETE CASCADE,
    gauge_address VARCHAR(42) REFERENCES gauges(gauge_address),
    total_votes TEXT NOT NULL,
    unique_voters INTEGER NOT NULL,
    unique_contributors INTEGER NOT NULL,
    PRIMARY KEY(epoch_id, gauge_address)
);

-- Delegate rankings (per epoch)
CREATE TABLE IF NOT EXISTS delegate_rankings (
    epoch_id INTEGER REFERENCES epochs(epoch_id) ON DELETE CASCADE,
    delegate_address VARCHAR(42) NOT NULL,
    total_voting_power TEXT NOT NULL,
    delegator_count INTEGER NOT NULL,
    gauges_voted_for INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    PRIMARY KEY(epoch_id, delegate_address)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_contributions_epoch ON contributions(epoch_id);
CREATE INDEX IF NOT EXISTS idx_contributions_delegator ON contributions(delegator_address);
CREATE INDEX IF NOT EXISTS idx_contributions_delegate ON contributions(delegate_address);
CREATE INDEX IF NOT EXISTS idx_contributions_gauge ON contributions(gauge_address);
CREATE INDEX IF NOT EXISTS idx_votes_epoch ON votes(epoch_id);
CREATE INDEX IF NOT EXISTS idx_votes_delegate ON votes(delegate_address);
CREATE INDEX IF NOT EXISTS idx_delegations_epoch ON delegations(epoch_id);
CREATE INDEX IF NOT EXISTS idx_delegations_delegator ON delegations(delegator_address);
CREATE INDEX IF NOT EXISTS idx_delegate_rankings_epoch ON delegate_rankings(epoch_id);
CREATE INDEX IF NOT EXISTS idx_delegate_rankings_rank ON delegate_rankings(epoch_id, rank);

-- Row Level Security (optional, enable if needed)
-- ALTER TABLE epochs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE gauges ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE epoch_gauge_totals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE delegate_rankings ENABLE ROW LEVEL SECURITY;

-- Create read-only policy for public access
-- CREATE POLICY "Allow public read access" ON epochs FOR SELECT USING (true);
-- CREATE POLICY "Allow public read access" ON gauges FOR SELECT USING (true);
-- CREATE POLICY "Allow public read access" ON votes FOR SELECT USING (true);
-- CREATE POLICY "Allow public read access" ON delegations FOR SELECT USING (true);
-- CREATE POLICY "Allow public read access" ON contributions FOR SELECT USING (true);
-- CREATE POLICY "Allow public read access" ON epoch_gauge_totals FOR SELECT USING (true);
-- CREATE POLICY "Allow public read access" ON delegate_rankings FOR SELECT USING (true);
