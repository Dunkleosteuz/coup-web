import random

CARD_TYPES = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]

# Card description for rules
CARD_DESCRIPTIONS = {
    "Duke": "Tax (+3 coins). Block Foreign Aid.",
    "Assassin": "Assassinate (-3 coins, target loses card). Blockable by Contessa.",
    "Captain": "Steal (up to 2 coins). Blockable by Captain/Ambassador.",
    "Ambassador": "Exchange (swap card with deck). Blockable by Steal action.",
    "Contessa": "Block Assassination"
}

ACTION_DESCRIPTIONS = {
    "income": "Collect 1 coin. Not blockable.",
    "foreign_aid": "Collect 2 coins. Blockable by Duke.",
    "tax": "Claim Duke, collect 3 coins. Challengeable.",
    "coup": "Pay 7 coins, target loses card. Not blockable, not challengeable.",
    "assassinate": "Pay 3 coins, claim Assassin, target loses card. Blockable by Contessa. Challengeable.",
    "steal": "Claim Captain, steal up to 2 coins. Blockable by Captain/Ambassador. Challengeable.",
    "exchange": "Claim Ambassador, swap card with deck. Challengeable."
}

def create_deck():
    deck = []
    for card in CARD_TYPES:
        deck += [card] * 3
    random.shuffle(deck)
    return deck

def deal_cards(deck, num_players):
    hands = []
    for _ in range(num_players):
        hand = [deck.pop(), deck.pop()]
        hands.append(hand)
    return hands, deck

def get_player(players, player_id):
    # Support lookup by internal row id, user_id (UUID) or guest_id (text)
    pid = str(player_id)
    for p in players:
        if str(p.get("id")) == pid:
            return p
        if p.get("user_id") and str(p.get("user_id")) == pid:
            return p
        if p.get("guest_id") and str(p.get("guest_id")) == pid:
            return p
    return None

def get_alive_players(players):
    return [p for p in players if p["is_alive"]]

def validate_action(player, action, game_state, target_id=None):
    if not player["is_alive"]:
        return False
    if action == "income":
        return True
    if action == "foreign_aid":
        return True
    if action == "tax":
        return True
    if action == "coup":
        if player["coins"] >= 7 and target_id:
            return True
        return False
    if action == "assassinate":
        if player["coins"] >= 3 and target_id:
            return True
        return False
    if action == "steal" and target_id:
        return True
    if action == "exchange":
        return True
    return False

def can_block_action(action):
    """Return which cards can block this action"""
    blockers = {
        "foreign_aid": ["Duke"],
        "assassinate": ["Contessa"],
        "steal": ["Captain", "Ambassador"]
    }
    return blockers.get(action, [])

def can_challenge_action(action):
    """Return if this action can be challenged"""
    challengeable = ["tax", "assassinate", "steal", "exchange"]
    return action in challengeable

def get_blockable_actions():
    """Actions that can be blocked"""
    return ["foreign_aid", "assassinate", "steal"]

def get_challengeable_actions():
    """Actions that can be challenged"""
    return ["tax", "assassinate", "steal", "exchange"]

def process_action(game_state, player_id, action, target_id=None, block_by=None, challenge_by=None, claim_card=None, block_card=None):
    players = game_state["players"]
    player = get_player(players, player_id)
    if not player:
        return game_state, "Player tidak ditemukan", None
    
    player_name = player.get("nickname") or "Anonymous"
    
    # Challenge phase - challenger proves actor has claim
    if challenge_by:
        challenger = get_player(players, challenge_by)
        if not challenger:
            return game_state, "Challenger tidak ditemukan", None
        challenger_name = challenger.get("nickname") or "Anonymous"
        
        # Check if actor really has the claim card
        if claim_card and claim_card in player["hand"]:
            # Challenge gagal - challenger loses card
            msg = f"Challenge gagal! {claim_card} benar-benar ada di tangan {player_name}. {challenger_name} harus pilih kartu untuk dibuang."
            return game_state, msg, challenge_by  # Return challenger_id to signal they need to select card
        else:
            # Challenge sukses - actor loses card
            msg = f"Challenge sukses! {player_name} tidak punya {claim_card}. {player_name} harus pilih kartu untuk dibuang."
            return game_state, msg, player_id  # Return player_id to signal they need to select card

    # Block phase
    if block_by:
        blocker = get_player(players, block_by)
        if not blocker:
            return game_state, "Blocker tidak ditemukan", None
        blocker_name = blocker.get("nickname") or "Anonymous"
        
        if block_card and block_card in blocker["hand"]:
            # Block successful - action cancelled
            msg = f"Aksi {action} berhasil diblokir oleh {block_card} milik {blocker_name}!"
            return game_state, msg, None
        else:
            # Block gagal - blocker loses card
            msg = f"Block gagal! {blocker_name} tidak punya {block_card}. {blocker_name} harus pilih kartu untuk dibuang."
            return game_state, msg, block_by  # Signal blocker needs to select card

    # Main action phase
    if action == "income":
        player["coins"] += 1
        msg = f"{player_name} mengambil Income (+1 coin)."
    elif action == "foreign_aid":
        player["coins"] += 2
        msg = f"{player_name} mengambil Foreign Aid (+2 coins)."
    elif action == "tax":
        player["coins"] += 3
        msg = f"{player_name} mengklaim Duke dan mengambil Tax (+3 coins)."
    elif action == "coup" and target_id:
        if player["coins"] < 7:
            return game_state, "Tidak cukup coins untuk Coup", None
        # Coup is handled separately with card selection
        player["coins"] -= 7
        target = get_player(players, target_id)
        if not target:
            return game_state, "Target tidak ditemukan", None
        target_name = target.get("nickname") or "Anonymous"
        msg = f"{player_name} melakukan Coup ke {target_name}! {target_name} harus memilih kartu untuk dibuang."
        return game_state, msg, target_id  # Signal target needs card selection
    elif action == "assassinate" and target_id:
        if player["coins"] < 3:
            return game_state, "Tidak cukup coins untuk Assassinate", None
        player["coins"] -= 3
        target = get_player(players, target_id)
        if not target:
            return game_state, "Target tidak ditemukan", None
        target_name = target.get("nickname") or "Anonymous"
        msg = f"{player_name} mengklaim Assassin dan mengasumsir {target_name}!"
        return game_state, msg, None  # Assassinate goes to reaction window, target can block
    elif action == "steal" and target_id:
        target = get_player(players, target_id)
        if not target:
            return game_state, "Target tidak ditemukan", None
        target_name = target.get("nickname") or "Anonymous"
        msg = f"{player_name} mengklaim Captain dan akan mencuri dari {target_name}!"
        return game_state, msg, None  # Steal goes to reaction window, target can block
    elif action == "exchange":
        # Exchange: claim Ambassador
        msg = f"{player_name} mengklaim Ambassador dan akan menukar kartu!"
        return game_state, msg, None  # Exchange goes to reaction window, others can challenge
    else:
        msg = "Aksi tidak valid."

    return game_state, msg, None

def reveal_card(player, card_index=None):
    """Reveal a card. If card_index provided, reveal that specific card; otherwise reveal first unrevealed."""
    if card_index is not None:
        if 0 <= card_index < len(player["revealed"]):
            player["revealed"][card_index] = True
    else:
        for idx, card in enumerate(player["hand"]):
            if not player["revealed"][idx]:
                player["revealed"][idx] = True
                break
    # Jika semua kartu terbuka, player out
    if all(player["revealed"]):
        player["is_alive"] = False

def advance_turn(game_state):
    """Advance turn to next alive player"""
    players = game_state["players"]
    alive = get_alive_players(players)
    if len(alive) <= 1:
        winner_name = (alive[0].get("nickname") or "Anonymous") if alive else None
        game_state["winner"] = winner_name
        game_state["game_over"] = True
    else:
        game_state["turn"] = (game_state["turn"] + 1) % len(players)
        # Skip dead players
        attempts = 0
        while not players[game_state["turn"]]["is_alive"] and attempts < len(players):
            game_state["turn"] = (game_state["turn"] + 1) % len(players)
            attempts += 1
    return game_state

def process_action_with_card_selection(game_state, player_id, action, target_id=None, card_index=None):
    """
    Process action that requires card selection from target (Coup/Assassinate successful challenge/block).
    Returns: (new_state, msg, player_id_needing_card_selection)
    """
    players = game_state["players"]
    player = get_player(players, player_id)
    if not player:
        return game_state, "Player tidak ditemukan", None
    
    player_name = player.get("nickname") or "Anonymous"
    
    # If card_index not provided, request it
    if card_index is None:
        return game_state, "Menunggu pemain untuk memilih kartu", player_id
    
    # Card index provided, execute the reveal
    reveal_card(player, card_index)
    msg = f"Pemain harus memilih kartu - Kartu ke-{card_index + 1} telah dibuang."
    
    # Check win condition and advance turn
    game_state = advance_turn(game_state)
    
    return game_state, msg, None

def execute_exchange(game_state, player_id, card_index=None):
    """Execute exchange action - swap specified unrevealed card with top of deck"""
    player = get_player(game_state["players"], player_id)
    if not player:
        return game_state, "Player tidak ditemukan"
    
    player_name = player.get("nickname") or "Anonymous"
    deck = game_state.get("deck", [])
    
    if not deck:
        return game_state, f"{player_name} tidak bisa menukar - deck kosong!"
    
    # If card_index not provided, select random unrevealed
    if card_index is None:
        unrevealed = [i for i, r in enumerate(player["revealed"]) if not r]
        if not unrevealed:
            return game_state, f"{player_name} tidak punya kartu yang belum terungkap!"
        card_index = random.choice(unrevealed)
    elif card_index < 0 or card_index >= len(player["hand"]) or player["revealed"][card_index]:
        return game_state, f"Kartu ke-{card_index + 1} tidak valid atau sudah terungkap!"
    
    # Swap
    old_card = player["hand"][card_index]
    new_card = deck.pop()  # ambil dari atas deck
    player["hand"][card_index] = new_card
    deck.append(old_card)  # kartu lama ke bawah deck, tanpa shuffle
    game_state["deck"] = deck
    
    msg = f"{player_name} menukar kartu dengan deck. Deck kembali ke {len(deck)} kartu."
    return game_state, msg
