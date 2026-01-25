# 🃏 Coup - Multiplayer Card Game

[![GitHub](https://img.shields.io/badge/GitHub-Dunkleosteuz%2Fcoup--web-blue?logo=github)](https://github.com/Dunkleosteuz/coup-web)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue?logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104%2B-00a393?logo=fastapi)](https://fastapi.tiangolo.com/)

> **Coup** adalah permainan kartu berbasis browser yang menampilkan gameplay real-time dengan 60-detik reaction windows, pilihan pemain untuk kartu yang akan dibuang, dan dukungan WebSocket lengkap. Sempurna untuk 2-6 pemain!

## 🎮 Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Cara Bermain](#cara-bermain)
- [Quick Start](#quick-start)
- [Instalasi Lengkap](#instalasi-lengkap)
- [Struktur Project](#struktur-project)
- [API Endpoints](#api-endpoints)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment-docker)

---

## ✨ Fitur Utama

### 🎯 60-Second Reaction Windows

Setelah pemain melakukan aksi, pemain lain memiliki **60 detik** untuk **Challenge** atau **Block**. Timer countdown real-time dan window otomatis menutup setelah waktu habis.

### 🎮 Player-Selected Card Discards

Ketika hit oleh **Coup** atau **Assassinate**, target memilih kartu mana yang akan dibuang — bukan acak!

### 🎨 Visual Card System

- Kartu influence dengan artwork dari assets folder
- Pop-up preview untuk melihat kartu secara detail
- Hand reveal modal saat game dimulai menunjukkan 2 kartu awal
- Clickable card thumbnails dengan visual feedback

### 🔒 Card Privacy System

- **Diri sendiri:** Lihat nama kartu + jumlah
- **Pemain lain:** Lihat hanya card back (🂠)
- **Kartu terbuka:** Terlihat untuk semua
- **Server-side masking** memastikan privasi

### ⚡ Real-Time WebSocket Updates

- Semua aksi broadcast secara instant
- **Tidak perlu refresh** halaman
- Game state update otomatis

### 🎵 Dynamic Background Music

- **Lobby Music:** Ambient, misterius, strategis
- **Game Music:** Energik, dramatis, dengan ritme
- **Volume Control:** Slider 0-100% + mute button
- **Persistence:** Preference disimpan lokal

---

## 🎮 Cara Bermain

### Kartu Influence (5 peran)

| Kartu             | Aksi                   | Blok        |
| ----------------- | ---------------------- | ----------- |
| **👑 Duke**       | Tax (+3 coins)         | Foreign Aid |
| **🗡️ Assassin**   | Assassinate (-3 coins) | —           |
| **⚓ Captain**    | Steal (+2 coins)       | Steal       |
| **🤝 Ambassador** | Exchange (swap kartu)  | Steal       |
| **🎭 Contessa**   | —                      | Assassinate |

### Mekanik Permainan

1. **Setup:** Setiap pemain mulai dengan 2 kartu + 2 coins
2. **Turn:** Pemain aktif melakukan 1 aksi
3. **Reaction (60s):** Pemain lain dapat Challenge atau Block
   - **Challenge:** Pemain harus reveal kartu yang diklaim
   - **Block:** Gunakan kartu spesifik untuk stop aksi
4. **Resolusi:** Pemain yang kalah pilih kartu mana untuk dibuang
5. **Kemenangan:** Pemain terakhir dengan kartu menang!

### Aksi Dasar

| Aksi            | Biaya   | Deskripsi                                    | Bisa Di-Block         | Bisa Di-Challenge |
| --------------- | ------- | -------------------------------------------- | --------------------- | ----------------- |
| **Income**      | —       | +1 coin                                      | ❌                    | ❌                |
| **Foreign Aid** | —       | +2 coins                                     | ✅ Duke               | ❌                |
| **Tax**         | —       | +3 coins (claim Duke)                        | ❌                    | ✅                |
| **Coup**        | 7 coins | Eliminasi 1 kartu                            | ❌                    | ❌                |
| **Assassinate** | 3 coins | Eliminasi 1 kartu (claim Assassin)           | ✅ Contessa           | ✅                |
| **Steal**       | —       | +2 coins (claim Captain)                     | ✅ Captain/Ambassador | ✅                |
| **Exchange**    | —       | Tukar 1 kartu dengan deck (claim Ambassador) | ❌                    | ✅                |

---

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Akun Supabase gratis (https://supabase.com)

### Setup (5-10 menit)

```bash
git clone https://github.com/Dunkleosteuz/coup-web.git
cd coup-web

# Venv
python -m venv venv
.\venv\Scripts\Activate.ps1

# Dependencies
pip install -r requirements.txt

# Setup .env (REQUIRED - copy dari .env.example)
copy .env.example .env
# Edit .env dengan Supabase credentials Anda

# Database setup di Supabase
# 1. Copy & jalankan: setup_database.sql
# 2. Copy & jalankan: add_trash_column.sql

# Run
./run.ps1
```

**Buka:** http://localhost:3000

---

## 📚 Instalasi Lengkap

### Step 1: Clone Repository

```bash
git clone https://github.com/Dunkleosteuz/coup-web.git
cd coup-web
```

### Step 2: Python Virtual Environment

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1     # PowerShell
.\venv\Scripts\activate.bat      # CMD

pip install -r requirements.txt
```

### Step 3: Supabase Setup (Required)

> ⚠️ **IMPORTANT:** Setiap user harus membuat akun Supabase sendiri dan setup `.env` dengan credentials mereka.
> `.env` tidak di-commit ke git untuk keamanan (mencegah credential leak).

1. **Buat Supabase Project:**
   - Buka https://supabase.com → Sign In/Sign Up
   - Create new project → pilih region
   - Tunggu 1-2 menit hingga selesai

2. **Dapatkan Credentials:**
   - Project Settings → API tab
   - Copy **Project URL** (mulai dengan https://xxxxx.supabase.co)
   - Copy **anon public key**

3. **Setup .env File:**

   ```bash
   # Copy template ke .env
   copy .env.example .env

   # Edit .env dengan text editor, replace:
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_KEY=eyJhbGc... (anon key dari dashboard)
   ```

   **DO NOT commit .env file!** (sudah di .gitignore)

### Step 4: Database Initialize

1. Buka Supabase SQL Editor
2. Jalankan: `setup_database.sql`
3. Jalankan: `add_trash_column.sql`

### Step 5: Run Server

```powershell
./run.ps1
# atau:
uvicorn backend.main:app --reload --host 0.0.0.0 --port 3000
```

**Output:**

```
INFO:     Uvicorn running on http://0.0.0.0:3000
```

---

## 📁 Struktur Project

```
coup-web/
├── 📂 backend/
│   ├── main.py              # FastAPI entry point
│   ├── api/
│   │   ├── auth.py          # Guest authentication
│   │   └── game.py          # Game endpoints & WebSocket
│   ├── game_logic.py        # Core mechanics
│   ├── models.py            # Pydantic schemas
│   └── supabase_client.py   # DB integration
│
├── 📂 static/
│   ├── index.html           # Main template
│   ├── game.js              # Game logic
│   ├── style.css            # Styling
│   ├── audio.js             # Music control
│   └── 📂 assets/           # Card images
│       ├── duke.png
│       ├── assasin.png
│       ├── captain.png
│       ├── ambassador.png
│       └── contessa.png
│
├── 📂 docker/
│   └── Dockerfile
│
├── .env                     # Environment (not in git)
├── .gitignore
├── .dockerignore
├── docker-compose.yml
├── requirements.txt
├── setup_database.sql       # DB schema
├── add_trash_column.sql     # DB migration
├── cleanup_database.sql     # Cleanup unused tables
├── run.ps1 / run.bat
└── README.md
```

---

## 🎯 API Endpoints

### Authentication

**`POST /auth/guest`**

```json
{
  "nickname": "PlayerName"
}
```

Response: `{ "session_id": "uuid", ... }`

### Game Management

| Method | Endpoint              | Purpose           |
| ------ | --------------------- | ----------------- |
| POST   | `/api/game/create`    | Buat room baru    |
| POST   | `/api/game/join`      | Join ke room      |
| POST   | `/api/game/start`     | Mulai game        |
| GET    | `/api/game/state`     | Ambil state       |
| POST   | `/api/game/action`    | Perform action    |
| POST   | `/api/game/leave`     | Leave game        |
| WS     | `/api/ws/{room_code}` | Real-time updates |

Detail lengkap di [GAME_LOGIC_UPDATES.md](GAME_LOGIC_UPDATES.md)

---

## 🔧 Troubleshooting

| Problem                | Solution                                     |
| ---------------------- | -------------------------------------------- |
| **uvicorn not found**  | Aktifkan venv: `.\venv\Scripts\Activate.ps1` |
| **Supabase error**     | Cek `.env` dengan URL dan KEY benar          |
| **Game tidak mulai**   | Butuh 2+ pemain, refresh browser             |
| **WebSocket putus**    | Cek firewall, restart server                 |
| **Kartu tidak muncul** | Hard refresh: Ctrl+Shift+R                   |

---

## 🐳 Docker Deployment

```bash
# Build
docker build -t coup-game -f docker/Dockerfile .

# Run
docker run -p 3000:3000 -e SUPABASE_URL=... -e SUPABASE_KEY=... coup-game

# Docker Compose
docker-compose up --build
docker-compose down
```

---

## 👥 Authors

- Jeremiah Gerard (55230126)
- Muhammad Syahrul (54200143)
- Nathan Tanoko (54220082)
- Timothy Henseputra (57220056)

**Dosen:** Bram Bravo, A.md.,S.Kom.,M.Kom.

---

## 📄 License

Educational purposes - Aplikasi Perancangan Program Game, Semester 7

---
