from fastapi.testclient import TestClient
from api import app as api_app

client = TestClient(api_app)

r = client.post('/game/create')
print('create:', r.status_code, r.json())
if r.status_code == 200:
    game_id = r.json()['game_id']
    r2 = client.post(f'/game/{game_id}/join', json={'player_name':'Alice'})
    print('join:', r2.status_code, r2.json())
    r3 = client.post(f'/game/{game_id}/start')
    print('start:', r3.status_code, r3.json())
    r4 = client.get(f'/game/{game_id}/players')
    print('players:', r4.status_code, r4.json())
