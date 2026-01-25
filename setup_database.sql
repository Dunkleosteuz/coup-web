-- ============================================================================
-- COUP Web - Complete Database Setup Script
-- ============================================================================
-- Jalankan di Supabase SQL Editor untuk setup lengkap database
-- Run this script completely di Supabase console
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop old/unused tables (if any exist)
-- ============================================================================
-- Uncomment section ini jika ada table lama yang ingin di-hapus
-- DROP TABLE IF EXISTS actions CASCADE;
-- DROP TABLE IF EXISTS leaderboard CASCADE;
-- DROP TABLE IF EXISTS guests CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- STEP 2: Create main tables for COUP Web
-- ============================================================================

-- Games table: Menyimpan state setiap game room
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(6) UNIQUE NOT NULL,
    host_id UUID,                                      -- Player yang create room
    status VARCHAR(20) DEFAULT 'waiting',              -- waiting, ongoing, over
    deck JSONB,                                        -- Remaining cards in deck
    trash JSONB DEFAULT '[]'::jsonb,                   -- Revealed/discarded cards
    turn INTEGER DEFAULT 0,
    current_player_index INTEGER DEFAULT 0,
    winner VARCHAR(255),                               -- UUID of winning player
    game_over BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Game players table: Menyimpan setiap player di game
CREATE TABLE IF NOT EXISTS game_players (
    id SERIAL PRIMARY KEY,
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID,                                      -- Untuk account users (nullable)
    guest_id VARCHAR(255),                             -- Untuk guest users (nullable)
    nickname VARCHAR(100) NOT NULL,
    coins INTEGER DEFAULT 2,
    hand JSONB DEFAULT '[]'::jsonb,                    -- Player's cards
    revealed JSONB DEFAULT '[]'::jsonb,                -- Boolean array: is card revealed?
    is_alive BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- STEP 3: Create indexes untuk performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_guest_id ON game_players(guest_id);

-- ============================================================================
-- STEP 4: Enable RLS (Row Level Security)
-- ============================================================================
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 5: Create RLS Policies (MVP - Permissive for testing)
-- ============================================================================
-- WARNING: Ini adalah development policy. Untuk production, gunakan JWT-based policies.

-- Drop existing policies jika ada
DROP POLICY IF EXISTS "Allow all operations on games" ON games;
DROP POLICY IF EXISTS "Allow all operations on game_players" ON game_players;

-- Create new permissive policies
CREATE POLICY "Allow all operations on games" ON games
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on game_players" ON game_players
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- STEP 6: Create helpful views
-- ============================================================================

-- View: Game status (useful untuk monitoring)
CREATE OR REPLACE VIEW game_status AS
SELECT 
    g.id,
    g.room_code,
    g.status,
    COUNT(gp.id) as player_count,
    SUM(CASE WHEN gp.is_alive THEN 1 ELSE 0 END) as alive_count,
    g.winner,
    g.created_at,
    EXTRACT(EPOCH FROM (NOW() - g.created_at)) as duration_seconds
FROM games g
LEFT JOIN game_players gp ON g.id = gp.game_id
GROUP BY g.id, g.room_code, g.status, g.winner, g.created_at
ORDER BY g.created_at DESC;

-- View: Player stats (useful untuk leaderboard later)
CREATE OR REPLACE VIEW player_stats AS
SELECT 
    guest_id,
    COUNT(*) as total_games,
    SUM(CASE WHEN is_alive = false THEN 1 ELSE 0 END) as games_eliminated,
    ROUND(AVG(coins)::numeric, 2) as avg_coins,
    MAX(coins) as max_coins
FROM game_players
WHERE guest_id IS NOT NULL
GROUP BY guest_id
ORDER BY total_games DESC;

-- ============================================================================
-- STEP 7: Verification & Documentation
-- ============================================================================
-- Run these queries untuk verify setup:

-- Check tables exist
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Check columns di games table
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'games' ORDER BY ordinal_position;

-- Check columns di game_players table
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'game_players' ORDER BY ordinal_position;

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- 
-- Database siap untuk COUP Web MVP!
--
-- Tables yang terbuat:
-- - games: Menyimpan game room dan state
-- - game_players: Menyimpan player data per game
--
-- Views yang terbuat:
-- - game_status: Monitor game status
-- - player_stats: Player statistics
--
-- Selanjutnya:
-- 1. Update .env dengan SUPABASE_URL dan SUPABASE_KEY
-- 2. Jalankan backend: python -m uvicorn backend.main:app --reload
-- 3. Buka browser: http://localhost:3000
-- 4. Create room dan mulai bermain!
--
-- ============================================================================
