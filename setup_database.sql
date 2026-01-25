-- COUP Web Database Schema
-- Setup script untuk Supabase PostgreSQL
-- Jalankan di Supabase SQL Editor

-- Create games table
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(6) UNIQUE NOT NULL,
    host_id UUID,
    status VARCHAR(20) DEFAULT 'waiting',
    deck JSONB,
    trash JSONB DEFAULT '[]'::jsonb,
    turn INTEGER DEFAULT 0,
    current_player_index INTEGER DEFAULT 0,
    winner VARCHAR(255),
    game_over BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create game_players table
CREATE TABLE IF NOT EXISTS game_players (
    id SERIAL PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID,
    guest_id VARCHAR(255),
    nickname VARCHAR(100) NOT NULL,
    coins INTEGER DEFAULT 2,
    hand JSONB DEFAULT '[]'::jsonb,
    revealed JSONB DEFAULT '[]'::jsonb,
    is_alive BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_guest_id ON game_players(guest_id);

-- Enable RLS (Row Level Security)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;

-- Create permissive RLS policies for MVP (development)
-- WARNING: This allows all reads/writes. For production, implement proper JWT-based policies.

CREATE POLICY "Allow all operations on games" ON games
    FOR ALL USING (true);

CREATE POLICY "Allow all operations on game_players" ON game_players
    FOR ALL USING (true);

-- Optional: View to check table status
CREATE OR REPLACE VIEW game_status AS
SELECT 
    g.room_code,
    g.status,
    COUNT(gp.id) as player_count,
    g.winner,
    g.created_at
FROM games g
LEFT JOIN game_players gp ON g.id = gp.game_id
GROUP BY g.id, g.room_code, g.status, g.winner, g.created_at
ORDER BY g.created_at DESC;
