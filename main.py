from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from api import app as api_app

app = FastAPI(title="Coup Game API", description="A multiplayer Coup card game")

# Mount static files for frontend
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mount API sub-application at /api
app.mount("/api", api_app)

@app.get("/")
async def read_root():
    return {"message": "Welcome to Coup Game API"}

@app.get("/game")
async def game_page():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
