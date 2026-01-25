-- COUP Web - Cleanup Script (Optional)
-- Hapus table-table yang tidak digunakan (leaderboard, users, actions, guests)
-- Jalankan ini hanya jika YAKIN ingin bersihkan database dari table lama

-- WARNING: Jangan jalankan jika ada data penting di table ini!
-- Ini akan DROP semua table dan data di dalamnya.

-- Drop unused tables (if they exist)
DROP TABLE IF EXISTS actions CASCADE;
DROP TABLE IF EXISTS leaderboard CASCADE;
DROP TABLE IF EXISTS guests CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Verify cleanup
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Expected output: hanya 'games' dan 'game_players' yang tersisa
