from supabase import create_client, Client
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Try to get from environment first, fallback to hardcoded values
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://rekxerjtempvpinaxhkc.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJla3hlcmp0ZW1wdnBpbmF4aGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MDc1NjQsImV4cCI6MjA4MzE4MzU2NH0.jpPoRLKDuEgJk7eAHT-SM4cKmhUsnCzGLuKQ5cYwFk8")

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"✓ Supabase connected to: {SUPABASE_URL[:30]}...")
except Exception as e:
    print(f"✗ Supabase initialization error: {e}")
    supabase = None  # Fallback, aplikasi tetap bisa run
