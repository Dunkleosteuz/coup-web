#!/bin/bash
echo "Starting Coup Game Server..."
echo "Application will be available at: http://localhost:3000"
exec uvicorn backend.main:app --host 0.0.0.0 --port 3000
