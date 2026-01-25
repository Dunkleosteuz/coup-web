-- COUP Web - Migration: Add Trash Column
-- This migration adds the trash/graveyard column to games table
-- Jalankan setelah setup_database.sql jika belum ada trash column

-- Add trash column jika belum ada
ALTER TABLE games
ADD COLUMN IF NOT EXISTS trash JSONB DEFAULT '[]'::jsonb;

-- Update existing games to have empty trash array
UPDATE games
SET trash = '[]'::jsonb
WHERE trash IS NULL;

-- Verify migration
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'games' AND column_name = 'trash';
