from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Body, Query
from typing import Optional
from backend.supabase_client import supabase
from backend.game_logic import create_deck, deal_cards, validate_action, process_action, get_player, process_action_with_card_selection, advance_turn, execute_exchange, can_challenge_action
import uuid, json, time, random
from postgrest import exceptions as postgrest_exceptions


def _ensure_revealed_length(player):
    """Keep revealed list length in sync with current hand length."""
    hand_len = len(player.get("hand", []))
    revealed = player.get("revealed") or []
    if len(revealed) < hand_len:
        revealed.extend([False] * (hand_len - len(revealed)))
    elif len(revealed) > hand_len:
        revealed = revealed[:hand_len]
    player["revealed"] = revealed


def discard_influence(game_state, player, card_index):
    """Remove a card from player's hand, send it to trash, and update alive state."""
    hand = player.get("hand", [])
    _ensure_revealed_length(player)
    if card_index is None or card_index < 0 or card_index >= len(hand):
        raise HTTPException(status_code=400, detail="card_index tidak valid")

    card = hand.pop(card_index)
    revealed = player.get("revealed", [])
    if card_index < len(revealed):
        revealed.pop(card_index)
    player["revealed"] = revealed

    trash = game_state.get("trash", [])
    trash.append(card)
    game_state["trash"] = trash

    if len(player.get("hand", [])) == 0:
        player["is_alive"] = False
    return card


def reveal_and_replace_claim(game_state, player, card_index, required_card):
    """Discard the revealed claim card to trash, draw a new one to keep hand size."""
    hand = player.get("hand", [])
    _ensure_revealed_length(player)
    if card_index is None or card_index < 0 or card_index >= len(hand):
        raise HTTPException(status_code=400, detail="card_index tidak valid")
    if required_card and hand[card_index] != required_card:
        raise HTTPException(status_code=400, detail="Kartu yang dipilih tidak sesuai klaim")

    trashed_card = hand[card_index]
    trash = game_state.get("trash", [])
    trash.append(trashed_card)
    game_state["trash"] = trash

    if not game_state.get("deck"):
        raise HTTPException(status_code=400, detail="Deck kosong")
    new_card = game_state["deck"].pop()
    player["hand"][card_index] = new_card
    player["revealed"][card_index] = False
    _ensure_revealed_length(player)
    return trashed_card, new_card

# Helper to apply action effect after successful challenge proof
def apply_action_effect(game_state, actor_id, action, target_id):
    actor = get_player(game_state["players"], actor_id)
    target = get_player(game_state["players"], target_id) if target_id else None
    actor_name = actor.get("nickname") if actor else "Anonymous"
    target_name = target.get("nickname") if target else "Anonymous"
    msg = None
    if action == "steal" and actor and target:
        amount = min(2, max(0, target.get("coins", 0)))
        target["coins"] = max(0, target.get("coins", 0) - amount)
        actor["coins"] = actor.get("coins", 0) + amount
        msg = f"{actor_name} mencuri {amount} coin dari {target_name}."
    elif action == "tax" and actor:
        actor["coins"] = actor.get("coins", 0) + 3
        msg = f"{actor_name} mengambil Tax (+3 coins)."
    elif action == "foreign_aid" and actor:
        actor["coins"] = actor.get("coins", 0) + 2
        msg = f"{actor_name} mengambil Foreign Aid (+2 coins)."
    elif action == "exchange" and actor:
        msg = f"{actor_name} akan menukar satu kartu dengan deck."
    elif action == "assassinate" and target:
        msg = f"{actor_name} berhasil mengasumsir {target_name}."
    return game_state, msg

router = APIRouter()
active_connections = {}
pending_actions = {}

def mask_state_for_viewer(state: dict, viewer_id: Optional[str]):
    try:
        game = state.get("game") or {}
        try:
            deck = json.loads(game.get("deck") if isinstance(game.get("deck"), str) else json.dumps(game.get("deck") or []))
        except Exception:
            deck = game.get("deck") or []
        try:
            trash = json.loads(game.get("trash") if isinstance(game.get("trash"), str) else json.dumps(game.get("trash") or []))
        except Exception:
            trash = game.get("trash") or []
        game_view = dict(game)
        game_view["deck_count"] = len(deck)
        game_view["trash"] = trash
        players = state.get("players") or []
        masked_players = []
        for p in players:
            mp = dict(p)
            try:
                hand = json.loads(p.get("hand") if isinstance(p.get("hand"), str) else json.dumps(p.get("hand") or []))
            except Exception:
                hand = p.get("hand") or []
            try:
                revealed = json.loads(p.get("revealed") if isinstance(p.get("revealed"), str) else json.dumps(p.get("revealed") or [False, False]))
            except Exception:
                revealed = p.get("revealed") or [False, False]

            mp["hand"] = hand
            mp["revealed"] = revealed
            _ensure_revealed_length(mp)

            pid = str(viewer_id) if viewer_id is not None else None
            is_self = pid is not None and (
                str(p.get("user_id")) == pid or str(p.get("guest_id")) == pid or str(p.get("id")) == pid
            )
            mp["hand"] = hand if is_self else ["?" if not mp["revealed"][i] else hand[i] for i in range(len(hand))]
            masked_players.append(mp)
        return {"game": game_view, "players": masked_players}
    except Exception as e:
        print(f"Masking error: {e}")
        return state

@router.post("/game/create")
async def create_game(host_id: str = Body(..., embed=True), room_code: Optional[str] = Body(None, embed=True)):
    rc = room_code if room_code else str(uuid.uuid4())[:8]
    deck = create_deck()
    
    try:
        game = supabase.table("games").insert({
            "room_code": rc,
            "host_id": host_id,
            "status": "waiting",
            "deck": json.dumps(deck),
            "trash": json.dumps([]),
            "turn": 0,
            "game_over": False
        }).execute()
    except postgrest_exceptions.APIError as e:
        error_msg = str(e)
        if "invalid input syntax for type uuid" in error_msg.lower():
            raise HTTPException(status_code=400, detail="Invalid host ID format. Please re-login as guest.")
        if "violates foreign key constraint" in error_msg.lower():
            raise HTTPException(status_code=400, detail="Host user not found. Please re-login.")
        raise HTTPException(status_code=500, detail=f"Database error: {error_msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    return {"message": "Game dibuat", "room_code": rc, "game": game.data}

@router.post("/game/join")
async def join_game(
    room_code: str = Body(..., embed=True),
    player_id: str = Body(..., embed=True),
    nickname: str = Body(..., embed=True)
):
    game = supabase.table("games").select("*").eq("room_code", room_code).execute()
    if not game.data:
        raise HTTPException(status_code=404, detail="Game tidak ditemukan")
    game_id = game.data[0]["id"]
    existing = supabase.table("game_players").select("*").eq("game_id", game_id).eq("nickname", nickname).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Sudah join")
    
    # Always store as guest_id since we use guest login
    try:
        player = supabase.table("game_players").insert({
            "game_id": game_id,
            "user_id": None,
            "guest_id": player_id,
            "nickname": nickname,
            "coins": 2,
            "is_alive": True,
            "hand": json.dumps([]),
            "revealed": json.dumps([False, False])
        }).execute()
    except postgrest_exceptions.APIError as e:
        error_msg = str(e)
        if "violates foreign key constraint" in error_msg.lower():
            raise HTTPException(status_code=400, detail="User not found in database. Please re-login.")
        raise HTTPException(status_code=500, detail=f"Database error: {error_msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        state = supabase.table("games").select("*").eq("room_code", room_code).execute().data[0]
        players = supabase.table("game_players").select("*").eq("game_id", state["id"]).order("id", {"ascending": True}).execute().data
        for p in players:
            try:
                p["hand"] = json.loads(p.get("hand") or "[]")
                p["revealed"] = json.loads(p.get("revealed") or "[false,false]")
            except Exception:
                p["hand"] = []
                p["revealed"] = [False, False]
            _ensure_revealed_length(p)
        if room_code in active_connections:
            for entry in list(active_connections[room_code]):
                try:
                    import json as _json
                    viewer = entry.get("player_id")
                    masked = mask_state_for_viewer({"game": state, "players": players}, viewer)
                    await entry["ws"].send_text(_json.dumps({"type": "lobby_update", **masked}))
                except Exception:
                    pass
    except Exception:
        pass

    return {"message": "Berhasil join", "player": player.data}

@router.post("/game/start")
async def start_game(room_code: str = Body(..., embed=True)):
    import random as py_random
    
    game = supabase.table("games").select("*").eq("room_code", room_code).execute()
    if not game.data:
        raise HTTPException(status_code=404, detail="Game tidak ditemukan")
    game_id = game.data[0]["id"]
    players = supabase.table("game_players").select("*").eq("game_id", game_id).execute().data
    
    if len(players) < 2:
        raise HTTPException(status_code=400, detail="Minimal 2 pemain untuk memulai")
    
    deck = create_deck()
    hands, deck = deal_cards(deck, len(players))
    for idx, player in enumerate(players):
        supabase.table("game_players").update({
            "hand": json.dumps(hands[idx]),
            "revealed": json.dumps([False, False])
        }).eq("id", player["id"]).execute()
    
    first_player_index = py_random.randint(0, len(players) - 1)
    
    supabase.table("games").update({
        "status": "started",
        "deck": json.dumps(deck),
        "turn": first_player_index
    }).eq("id", game_id).execute()

    try:
        state_game = supabase.table("games").select("*").eq("room_code", room_code).execute().data[0]
        try:
            updated_players = supabase.table("game_players").select("*").eq("game_id", state_game["id"]).order("id", {"ascending": True}).execute().data
        except Exception:
            updated_players = supabase.table("game_players").select("*").eq("game_id", state_game["id"]).execute().data
        for p in updated_players:
            try:
                p["hand"] = json.loads(p.get("hand") or "[]")
                p["revealed"] = json.loads(p.get("revealed") or "[false,false]")
            except Exception:
                p["hand"] = []
                p["revealed"] = [False, False]
            _ensure_revealed_length(p)
        game_state = {"game": state_game, "players": updated_players}
        if room_code in active_connections:
            for entry in list(active_connections[room_code]):
                try:
                    import json as _json
                    viewer = entry.get("player_id")
                    masked = mask_state_for_viewer(game_state, viewer)
                    await entry["ws"].send_text(_json.dumps({"type": "started", "gameState": masked}))
                except Exception:
                    pass
    except Exception:
        pass

    return {"message": "Game dimulai"}

@router.get("/game/state")
async def get_game_state(room_code: str, viewer_id: Optional[str] = None):
    game = supabase.table("games").select("*").eq("room_code", room_code).execute()
    if not game.data:
        raise HTTPException(status_code=404, detail="Game tidak ditemukan")
    game_id = game.data[0]["id"]
    try:
        players = supabase.table("game_players").select("*").eq("game_id", game_id).order("id", {"ascending": True}).execute().data
    except Exception:
        players = supabase.table("game_players").select("*").eq("game_id", game_id).execute().data
    for p in players:
        p["hand"] = json.loads(p["hand"])
        p["revealed"] = json.loads(p["revealed"])
        _ensure_revealed_length(p)
    state = {
        "game": game.data[0],
        "players": players
    }
    return mask_state_for_viewer(state, viewer_id)

@router.post("/game/action")
async def game_action(
    room_code: str = Body(..., embed=True),
    player_id: str = Body(..., embed=True),
    action_type: str = Body(..., embed=True),
    target_id: Optional[str] = Body(None, embed=True),
    card_index: Optional[int] = Body(None, embed=True),
    block_by: Optional[str] = Body(None, embed=True),
    challenge_by: Optional[str] = Body(None, embed=True),
    claim_card: Optional[str] = Body(None, embed=True),
    block_card: Optional[str] = Body(None, embed=True),
):
    game = supabase.table("games").select("*").eq("room_code", room_code).execute()
    if not game.data:
        raise HTTPException(status_code=404, detail="Game tidak ditemukan")
    
    game_data = game.data[0]
    game_id = game_data["id"]
    
    if game_data.get("game_over"):
        raise HTTPException(status_code=400, detail="Game sudah berakhir")
    
    game_state = game_data
    try:
        deck = json.loads(game_state.get("deck") if isinstance(game_state.get("deck"), str) else json.dumps(game_state.get("deck") or []))
    except Exception:
        deck = []
    game_state["deck"] = deck
    try:
        trash = json.loads(game_state.get("trash") if isinstance(game_state.get("trash"), str) else json.dumps(game_state.get("trash") or []))
    except Exception:
        trash = []
    game_state["trash"] = trash
    players = supabase.table("game_players").select("*").eq("game_id", game_id).execute().data
    for p in players:
        p["hand"] = json.loads(p["hand"])
        p["revealed"] = json.loads(p["revealed"])
        _ensure_revealed_length(p)
    game_state["players"] = players
    
    if action_type in ("challenge", "block", "select_card", "pass"):
        if room_code not in pending_actions:
            raise HTTPException(status_code=400, detail="Tidak ada aksi yang pending untuk direaksi")
        
        pending = pending_actions[room_code]
        
        elapsed = time.time() - pending["timestamp"]
        if elapsed > 60:
            del pending_actions[room_code]
            raise HTTPException(status_code=400, detail="Waktu reaksi 60 detik sudah habis")
        
        if action_type == "pass":
            pa = pending
            actor_id_pa = pa.get("actor_id")
            action_pa = pa.get("action")
            target_pa = pa.get("target_id")
            current_stage = pa.get("stage")
            if current_stage == "block_reaction":
                blocker_id = pa.get("blocker_id")
                blocker = get_player(players, blocker_id)
                blocker_name = blocker.get("nickname") or "Anonymous" if blocker else "Unknown"
                block_card_used = pa.get("block_card") or "Unknown"
                msg = f"Block oleh {blocker_name} dengan {block_card_used} diterima! Aksi {action_pa} dibatalkan."
                game_state = advance_turn(game_state)
                del pending_actions[room_code]
            elif current_stage == "reaction":
                if action_pa == "exchange":
                    pending_actions[room_code] = {
                        "actor_id": actor_id_pa,
                        "action": action_pa,
                        "target_id": target_pa,
                        "timestamp": time.time(),
                        "game_id": game_id,
                        "stage": "card_selection",
                        "awaiting_from": actor_id_pa
                    }
                    msg = "Tidak ada yang challenge, pilih kartu untuk exchange."
                elif action_pa == "assassinate":
                    pending_actions[room_code] = {
                        "actor_id": actor_id_pa,
                        "action": action_pa,
                        "target_id": target_pa,
                        "timestamp": time.time(),
                        "game_id": game_id,
                        "stage": "card_selection",
                        "awaiting_from": target_pa
                    }
                    msg = "Assassinate diterima, target harus memilih kartu untuk dibuang."
                else:
                    game_state, effect_msg = apply_action_effect(game_state, actor_id_pa, action_pa, target_pa)
                    msg = f"Aksi {action_pa} diterima. " + (effect_msg or "")
                    game_state = advance_turn(game_state)
                    del pending_actions[room_code]
            else:
                raise HTTPException(status_code=400, detail="Tidak bisa pass pada tahap ini")

        elif action_type == "select_card":
            if card_index is None:
                raise HTTPException(status_code=400, detail="card_index harus disediakan untuk select_card")
            stage = pending.get("stage")
            if stage == "reveal_claim":
                required = pending.get("required_card")
                actor = get_player(game_state["players"], pending.get("awaiting_from"))
                if not actor:
                    raise HTTPException(status_code=400, detail="Actor not found")
                trashed_card, new_card = reveal_and_replace_claim(game_state, actor, card_index, required)
                msg = f"{actor['nickname']} membuktikan {required}, kartu {trashed_card} dibuang ke trash, ambil kartu baru."
                pending_actions[room_code] = {
                    "actor_id": pending["actor_id"],
                    "action": pending["action"],
                    "target_id": pending["target_id"],
                    "timestamp": time.time(),
                    "game_id": game_id,
                    "stage": "card_selection",
                    "awaiting_from": pending.get("next_card_selection_from"),
                    "challenge_failed": True
                }
            elif stage == "card_selection":
                if pending.get("action") == "exchange":
                    actor = get_player(game_state["players"], pending.get("awaiting_from"))
                    if not actor:
                        raise HTTPException(status_code=400, detail="Actor not found")
                    game_state, msg = execute_exchange(game_state, pending.get("awaiting_from"), card_index)
                    game_state = advance_turn(game_state)
                    del pending_actions[room_code]
                else:
                    player = get_player(game_state["players"], pending.get("awaiting_from"))
                    if not player:
                        raise HTTPException(status_code=400, detail="Player not found")
                    discarded_card = discard_influence(game_state, player, card_index)
                    if not player.get("is_alive", True):
                        msg = f"{player['nickname']} kehilangan semua pengaruh dan keluar dari permainan."
                    else:
                        remaining = len(player.get("hand", []))
                        msg = f"{player['nickname']} membuang kartu: {discarded_card}. Sisa kartu: {remaining}."
                    
                    skip_advance = False

                    if pending.get("challenge_failed"):
                        if pending.get("blocker_proved"):
                            msg = msg + " Block berhasil, aksi dibatalkan."
                        elif pending.get("action") == "exchange":
                            pending_actions[room_code] = {
                                "actor_id": pending.get("actor_id"),
                                "action": "exchange",
                                "target_id": pending.get("target_id"),
                                "timestamp": time.time(),
                                "game_id": game_id,
                                "stage": "card_selection",
                                "awaiting_from": pending.get("actor_id")
                            }
                            msg = msg + " Aksi exchange berhasil, pilih kartu untuk ditukar."
                            skip_advance = True
                        else:
                            game_state, effect_msg = apply_action_effect(game_state, pending.get("actor_id"), pending.get("action"), pending.get("target_id"))
                            if effect_msg:
                                msg = msg + " " + effect_msg
                    
                    elif pending.get("block_failed"):
                        original_action = pending.get("original_action")
                        if original_action:
                            game_state, effect_msg = apply_action_effect(game_state, pending.get("actor_id"), original_action, pending.get("target_id"))
                            if effect_msg:
                                msg = msg + " " + effect_msg
                    
                    if not skip_advance:
                        game_state = advance_turn(game_state)
                        del pending_actions[room_code]
            else:
                raise HTTPException(status_code=400, detail="Tahap pemilihan kartu tidak dikenal")
        else:
            if action_type == "block":
                action_to_block = pending.get("action")
                blockable_actions = ["foreign_aid", "assassinate", "steal"]
                if action_to_block not in blockable_actions:
                    raise HTTPException(status_code=400, detail=f"Aksi {action_to_block} tidak bisa di-block")
                
                if not block_card:
                    raise HTTPException(status_code=400, detail="block_card harus disediakan untuk block")

                # Only valid blockers can respond:
                # - foreign_aid: anyone except the actor may block
                # - assassinate / steal: only the target may block
                target_id_pending = pending.get("target_id")
                blocker_player = get_player(players, player_id)
                target_player = get_player(players, target_id_pending) if target_id_pending else None
                
                if action_to_block in ["assassinate", "steal"]:
                    if not target_player or str(blocker_player.get("id")) != str(target_player.get("id")):
                        raise HTTPException(status_code=400, detail=f"Hanya target yang bisa memblokir aksi {action_to_block}")
                elif action_to_block == "foreign_aid":
                    actor_id_pending = pending.get("actor_id")
                    actor_player = get_player(players, actor_id_pending)
                    if actor_player and str(blocker_player.get("id")) == str(actor_player.get("id")):
                        raise HTTPException(status_code=400, detail="Pelaku tidak bisa memblokir aksinya sendiri")

                allowed_block_cards = {
                    "foreign_aid": ["Duke"],
                    "assassinate": ["Contessa"],
                    "steal": ["Captain", "Ambassador"],
                }
                allowed_cards = allowed_block_cards.get(action_to_block, [])
                if block_card not in allowed_cards:
                    raise HTTPException(status_code=400, detail=f"{block_card} tidak bisa memblokir aksi {action_to_block}")
                
                blocker = blocker_player  # Use already retrieved blocker_player
                
                blocker_name = blocker.get("nickname") or "Anonymous" if blocker else "Unknown"
                
                # Check if blocker actually has the block card
                if block_card not in blocker.get("hand", []):
                    # Blocker claims to have card but doesn't - show notification
                    msg = f"{blocker_name} mengklaim punya {block_card} tapi tidak! Aksi lanjut ke tahap challenge reaction."
                    # Go directly to block_reaction stage so others can challenge the false claim
                else:
                    msg = f"{blocker_name} blokir dengan {block_card}!"
                
                pending_actions[room_code] = {
                    "actor_id": pending["actor_id"],
                    "action": pending["action"],
                    "target_id": pending["target_id"],
                    "timestamp": time.time(),
                    "game_id": game_id,
                    "stage": "block_reaction",
                    "blocker_id": player_id,
                    "block_card": block_card,
                    "block_card_claimed": True
                }
            else:
                current_stage = pending.get("stage")
                if current_stage == "block_reaction":
                    blocker_id = pending.get("blocker_id")
                    block_card_used = pending.get("block_card")
                    blocker = get_player(players, blocker_id)
                    challenger = get_player(players, player_id)
                    blocker_name = blocker.get("nickname") or "Anonymous" if blocker else "Unknown"
                    challenger_name = challenger.get("nickname") or "Anonymous" if challenger else "Unknown"
                    
                    if blocker and block_card_used in blocker.get("hand", []):
                        msg = f"{blocker_name} membuktikan {block_card_used}! Challenge gagal."
                        pending_actions[room_code] = {
                            "actor_id": pending["actor_id"],
                            "action": pending["action"],
                            "target_id": pending["target_id"],
                            "timestamp": time.time(),
                            "game_id": game_id,
                            "stage": "reveal_claim",
                            "awaiting_from": blocker_id,
                            "required_card": block_card_used,
                            "next_card_selection_from": player_id,
                            "blocker_proved": True,
                            "original_action": pending.get("action")
                        }
                    else:
                        msg = f"Challenge sukses! {blocker_name} tidak punya {block_card_used}."
                        pending_actions[room_code] = {
                            "actor_id": pending["actor_id"],
                            "action": pending["action"],
                            "target_id": pending["target_id"],
                            "timestamp": time.time(),
                            "game_id": game_id,
                            "stage": "card_selection",
                            "awaiting_from": blocker_id,
                            "block_failed": True,
                            "original_action": pending.get("action")
                        }
                else:
                    current_action = pending.get("action")
                    if not can_challenge_action(current_action):
                        raise HTTPException(status_code=400, detail=f"Aksi {current_action} tidak bisa di-challenge")
                    
                    actor = get_player(players, pending.get("actor_id"))
                    challenger = get_player(players, player_id)
                    actor_name = actor.get("nickname") or "Anonymous" if actor else "Unknown"
                    challenger_name = challenger.get("nickname") or "Anonymous" if challenger else "Unknown"
                    
                    action_to_card = {"tax": "Duke", "assassinate": "Assassin", "steal": "Captain", "exchange": "Ambassador"}
                    claimed_card = action_to_card.get(pending.get("action"), "Unknown")
                    
                    if actor and claimed_card in actor.get("hand", []):
                        msg = f"Challenge gagal! {actor_name} memiliki {claimed_card}. {challenger_name} harus discard kartu."
                        pending_actions[room_code] = {
                            "actor_id": pending["actor_id"],
                            "action": pending["action"],
                            "target_id": pending["target_id"],
                            "timestamp": time.time(),
                            "game_id": game_id,
                            "stage": "reveal_claim",
                            "awaiting_from": pending["actor_id"],
                            "required_card": claimed_card,
                            "next_card_selection_from": player_id,
                            "challenge_failed": True
                        }
                    else:
                        msg = f"Challenge sukses! {actor_name} tidak punya {claimed_card}. {actor_name} harus discard kartu."
                        pending_actions[room_code] = {
                            "actor_id": pending["actor_id"],
                            "action": pending["action"],
                            "target_id": pending["target_id"],
                            "timestamp": time.time(),
                            "game_id": game_id,
                            "stage": "card_selection",
                            "awaiting_from": pending["actor_id"]
                        }
    else:
        actor = get_player(players, player_id)
        if not actor:
            raise HTTPException(status_code=400, detail="Pemain tidak ditemukan")
        
        current_turn_player = players[game_state.get("turn", 0)] if game_state.get("turn") is not None else None
        if current_turn_player and str(current_turn_player.get("id")) != str(actor.get("id")):
            raise HTTPException(status_code=400, detail="Bukan giliran Anda")
        
        if not validate_action(actor, action_type, game_state, target_id):
            raise HTTPException(status_code=400, detail=f"Aksi '{action_type}' tidak valid")
        
        if action_type == "income":
            actor["coins"] += 1
            actor_name = actor.get("nickname") or "Anonymous"
            msg = f"{actor_name} mengambil Income (+1 coin)."
            game_state = advance_turn(game_state)
            if room_code in pending_actions:
                del pending_actions[room_code]
        elif action_type == "coup" and target_id:
            if actor["coins"] < 7:
                raise HTTPException(status_code=400, detail="Tidak cukup coins untuk Coup")
            actor["coins"] -= 7
            target = get_player(players, target_id)
            if not target:
                raise HTTPException(status_code=400, detail="Target tidak ditemukan")
            target_name = target.get("nickname") or "Anonymous"
            msg = f"{actor['nickname']} melakukan Coup ke {target_name}! {target_name} harus memilih kartu untuk dibuang."
            pending_actions[room_code] = {
                "actor_id": player_id,
                "action": action_type,
                "target_id": target_id,
                "timestamp": time.time(),
                "game_id": game_id,
                "stage": "card_selection",
                "awaiting_from": target_id
            }
        elif action_type == "assassinate" and target_id:
            if actor["coins"] < 3:
                raise HTTPException(status_code=400, detail="Tidak cukup coins untuk Assassinate")
            actor["coins"] -= 3
            target = get_player(players, target_id)
            if not target:
                raise HTTPException(status_code=400, detail="Target tidak ditemukan")
            target_name = target.get("nickname") or "Anonymous"
            msg = f"{actor['nickname']} mengklaim Assassin dan mengasumsir {target_name}!"
            pending_actions[room_code] = {
                "actor_id": player_id,
                "action": action_type,
                "target_id": target_id,
                "timestamp": time.time(),
                "game_id": game_id,
                "stage": "reaction"
            }
        elif action_type in ["tax", "steal", "foreign_aid", "exchange"]:
            if action_type == "tax":
                msg = f"{actor['nickname']} mengklaim Duke dan akan mengambil Tax (+3 coins)."
            elif action_type == "steal" and target_id:
                target = get_player(players, target_id)
                if not target:
                    raise HTTPException(status_code=400, detail="Target tidak ditemukan")
                target_name = target.get("nickname") or "Anonymous"
                msg = f"{actor['nickname']} mengklaim Captain dan akan mencuri dari {target_name}!"
            elif action_type == "foreign_aid":
                msg = f"{actor['nickname']} mengambil Foreign Aid (+2 coins)."
            elif action_type == "exchange":
                msg = f"{actor['nickname']} mengklaim Ambassador dan akan menukar kartu!"
            
            pending_actions[room_code] = {
                "actor_id": player_id,
                "action": action_type,
                "target_id": target_id,
                "timestamp": time.time(),
                "game_id": game_id,
                "stage": "reaction"
            }
        else:
            raise HTTPException(status_code=400, detail="Aksi tidak valid")
    
    for p in game_state["players"]:
        _ensure_revealed_length(p)
        supabase.table("game_players").update({
            "coins": p["coins"],
            "hand": json.dumps(p["hand"]),
            "revealed": json.dumps(p["revealed"]),
            "is_alive": p["is_alive"]
        }).eq("id", p["id"]).execute()
    
    supabase.table("games").update({
        "turn": game_state["turn"],
        "deck": json.dumps(game_state["deck"]),
        "trash": json.dumps(game_state.get("trash", [])),
        "winner": game_state.get("winner"),
        "game_over": game_state.get("game_over", False)
    }).eq("id", game_id).execute()
    
    game_state_for_broadcast = {
        "id": game_id,
        "room_code": room_code,
        "turn": game_state["turn"],
        "deck": game_state["deck"],
        "trash": game_state.get("trash", []),
        "game_over": game_state.get("game_over", False),
        "winner": game_state.get("winner"),
        "status": game_data.get("status", "started")
    }
    
    if room_code in active_connections:
        for entry in active_connections[room_code]:
            try:
                viewer = entry.get("player_id")
                masked = mask_state_for_viewer({"game": game_state_for_broadcast, "players": game_state["players"]}, viewer)
                payload = {"type": "action", "msg": msg, "gameState": masked}
                if room_code in pending_actions:
                    pa = pending_actions[room_code]
                    payload["pending_action"] = {
                        "actor_id": pa["actor_id"],
                        "action": pa["action"],
                        "target_id": pa.get("target_id"),
                        "awaiting_from": pa.get("awaiting_from"),
                        "required_card": pa.get("required_card"),
                        "time_remaining": max(0, 60 - (time.time() - pa["timestamp"])),
                        "stage": pa["stage"],
                        "blocker_id": pa.get("blocker_id"),
                        "block_card": pa.get("block_card")
                    }
                await entry["ws"].send_text(json.dumps(payload))
            except Exception:
                pass
    
    return {"message": msg, "gameState": {"game": game_state_for_broadcast, "players": game_state["players"]}, "pending_action": pending_actions.get(room_code)}


@router.post("/game/leave")
async def leave_game(room_code: str = Body(..., embed=True), player_id: str = Body(..., embed=True)):
    game = supabase.table("games").select("*").eq("room_code", room_code).execute()
    if not game.data:
        raise HTTPException(status_code=404, detail="Game tidak ditemukan")
    game_id = game.data[0]["id"]

    try:
        deleted = None
        try:
            uuid.UUID(str(player_id))
            deleted = supabase.table("game_players").delete().eq("game_id", game_id).eq("user_id", player_id).execute()
        except Exception:
            deleted = supabase.table("game_players").delete().eq("game_id", game_id).eq("guest_id", player_id).execute()

        if deleted and (not deleted.data):
            supabase.table("game_players").delete().eq("game_id", game_id).eq("nickname", player_id).execute()
    except postgrest_exceptions.APIError as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        state = supabase.table("games").select("*").eq("room_code", room_code).execute().data[0]
        try:
            players = supabase.table("game_players").select("*").eq("game_id", state["id"]).order("id", {"ascending": True}).execute().data
        except Exception:
            players = supabase.table("game_players").select("*").eq("game_id", state["id"]).execute().data
        for p in players:
            try:
                p["hand"] = json.loads(p.get("hand") or "[]")
                p["revealed"] = json.loads(p.get("revealed") or "[false,false]")
            except Exception:
                p["hand"] = []
                p["revealed"] = [False, False]
            _ensure_revealed_length(p)
        if room_code in active_connections:
            for entry in list(active_connections[room_code]):
                try:
                    import json as _json
                    viewer = entry.get("player_id")
                    masked = mask_state_for_viewer({"game": state, "players": players}, viewer)
                    await entry["ws"].send_text(_json.dumps({"type": "lobby_update", **masked}))
                except Exception:
                    pass
    except Exception:
        pass

    return {"message": "Left"}


@router.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_id: Optional[str] = Query(None)):
    await websocket.accept()
    
    if room_code not in active_connections:
        active_connections[room_code] = []
    
    connection_entry = {"ws": websocket, "player_id": player_id}
    active_connections[room_code].append(connection_entry)
    
    try:
        game = supabase.table("games").select("*").eq("room_code", room_code).execute()
        if game.data:
            game_id = game.data[0]["id"]
            players = supabase.table("game_players").select("*").eq("game_id", game_id).execute().data
            for p in players:
                try:
                    p["hand"] = json.loads(p.get("hand") or "[]")
                    p["revealed"] = json.loads(p.get("revealed") or "[false,false]")
                except Exception:
                    p["hand"] = []
                    p["revealed"] = [False, False]
                _ensure_revealed_length(p)
            
            state_to_send = {"game": game.data[0], "players": players}
            masked = mask_state_for_viewer(state_to_send, player_id)
            
            payload = {"type": "lobby_update", **masked}
            if room_code in pending_actions:
                pa = pending_actions[room_code]
                payload["pending_action"] = {
                    "actor_id": pa["actor_id"],
                    "action": pa["action"],
                    "target_id": pa.get("target_id"),
                    "awaiting_from": pa.get("awaiting_from"),
                    "required_card": pa.get("required_card"),
                    "time_remaining": max(0, 60 - (time.time() - pa["timestamp"])),
                    "stage": pa["stage"]
                }
            
            await websocket.send_text(json.dumps(payload))
        
        while True:
            try:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except WebSocketDisconnect:
                break
            except Exception:
                break
    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        if room_code in active_connections:
            active_connections[room_code] = [
                entry for entry in active_connections[room_code]
                if entry["ws"] != websocket
            ]
            if len(active_connections[room_code]) == 0:
                del active_connections[room_code]
