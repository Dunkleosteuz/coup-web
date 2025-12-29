from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from typing import List, Dict
import json
import uuid
from models import Game, Player, GameAction, Challenge
from game_logic import CoupGameEngine
from pydantic import BaseModel

class JoinRequest(BaseModel):
    player_name: str

app = FastAPI()
game_engine = CoupGameEngine()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, game_id: str):
        await websocket.accept()
        if game_id not in self.active_connections:
            self.active_connections[game_id] = []
        self.active_connections[game_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, game_id: str):
        if game_id in self.active_connections:
            self.active_connections[game_id].remove(websocket)
    
    async def broadcast(self, game_id: str, message: dict):
        if game_id in self.active_connections:
            for connection in self.active_connections[game_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    pass

manager = ConnectionManager()

@app.post("/game/create")
async def create_game():
    game_id = str(uuid.uuid4())
    game = game_engine.create_game(game_id)
    return {"game_id": game_id, "message": "Game created successfully"}

@app.post("/game/{game_id}/join")
async def join_game(game_id: str, payload: JoinRequest):
    player = game_engine.add_player_to_game(game_id, payload.player_name)
    if not player:
        raise HTTPException(status_code=400, detail="Cannot join game")
    
    await manager.broadcast(game_id, {
        "type": "player_joined",
        "player": {"id": player.id, "name": player.name}
    })
    
    return {"player_id": player.id, "message": "Joined game successfully"}

@app.post("/game/{game_id}/start")
async def start_game(game_id: str):
    success = game_engine.start_game(game_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot start game")
    
    game = game_engine.get_game_state(game_id)
    await manager.broadcast(game_id, {
        "type": "game_started",
        "game_state": game.dict()
    })
    
    return {"message": "Game started"}

@app.get("/game/{game_id}/state")
async def get_game_state(game_id: str):
    game = game_engine.get_game_state(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game.dict()

@app.post("/game/{game_id}/action")
async def perform_action(game_id: str, action: GameAction):
    if not game_engine.validate_action(game_id, action):
        raise HTTPException(status_code=400, detail="Invalid action")
    
    success = game_engine.execute_action(game_id, action)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to execute action")
    
    game = game_engine.get_game_state(game_id)
    await manager.broadcast(game_id, {
        "type": "action_performed",
        "action": action.dict(),
        "game_state": game.dict()
    })
    
    return {"message": "Action performed successfully"}

@app.post("/game/{game_id}/challenge")
async def challenge_action(game_id: str, challenge: Challenge):
    success = game_engine.challenge_action(game_id, challenge)
    if not success:
        raise HTTPException(status_code=400, detail="Challenge failed")
    
    game = game_engine.get_game_state(game_id)
    await manager.broadcast(game_id, {
        "type": "challenge_performed",
        "challenge": challenge.dict(),
        "game_state": game.dict()
    })
    
    return {"message": "Challenge processed"}

@app.websocket("/ws/{game_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str):
    await manager.connect(websocket, game_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle WebSocket messages if needed
            message = json.loads(data)
            await manager.broadcast(game_id, message)
    except WebSocketDisconnect:
        manager.disconnect(websocket, game_id)

@app.get("/game/{game_id}/players")
async def get_players(game_id: str):
    game = game_engine.get_game_state(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    return [{"id": p.id, "name": p.name, "coins": p.coins, "is_alive": p.is_alive} for p in game.players]
