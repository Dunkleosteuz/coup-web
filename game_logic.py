from typing import List, Optional, Dict
import random
from models import Game, Player, Card, CardType, ActionType, GameAction, Challenge

class CoupGameEngine:
    def __init__(self):
        self.games: Dict[str, Game] = {}
    
    def create_game(self, game_id: str) -> Game:
        game = Game(id=game_id)
        self.games[game_id] = game
        return game
    
    def create_deck(self) -> List[Card]:
        deck = []
        # Create 3 of each card type for a 6-player game
        for card_type in CardType:
            for _ in range(3):
                deck.append(Card(type=card_type))
        random.shuffle(deck)
        return deck
    
    def add_player_to_game(self, game_id: str, player_name: str) -> Optional[Player]:
        game = self.games.get(game_id)
        if not game or game.game_started:
            return None
        
        if len(game.players) >= 6:
            return None
        
        player = Player(id=str(len(game.players)), name=player_name)
        game.players.append(player)
        return player
    
    def start_game(self, game_id: str) -> bool:
        game = self.games.get(game_id)
        if not game or len(game.players) < 2:
            return False
        
        game.game_started = True
        game.deck = self.create_deck()
        
        # Deal 2 cards to each player
        for player in game.players:
            for _ in range(2):
                if game.deck:
                    player.cards.append(game.deck.pop())
        
        return True
    
    def validate_action(self, game_id: str, action: GameAction) -> bool:
        game = self.games.get(game_id)
        if not game or game.game_over:
            return False
        
        player = game.get_player_by_id(action.player_id)
        if not player or not player.is_alive:
            return False
        
        current_player = game.get_current_player()
        if not current_player or current_player.id != action.player_id:
            return False
        
        # Validate action based on type
        if action.action_type == ActionType.INCOME:
            return True
        elif action.action_type == ActionType.FOREIGN_AID:
            return True
        elif action.action_type == ActionType.COUP:
            return player.coins >= 7 and action.target_id is not None
        elif action.action_type == ActionType.ASSASSINATE:
            return player.coins >= 3 and action.target_id is not None
        elif action.action_type == ActionType.STEAL:
            return action.target_id is not None
        elif action.action_type == ActionType.TAX:
            return True
        elif action.action_type == ActionType.EXCHANGE:
            return True
        
        return False
    
    def execute_action(self, game_id: str, action: GameAction) -> bool:
        game = self.games.get(game_id)
        if not game:
            return False
        
        player = game.get_player_by_id(action.player_id)
        if not player:
            return False
        
        # Execute action based on type
        if action.action_type == ActionType.INCOME:
            player.coins += 1
        elif action.action_type == ActionType.FOREIGN_AID:
            player.coins += 2
        elif action.action_type == ActionType.COUP:
            if player.coins >= 7 and action.target_id:
                player.coins -= 7
                target = game.get_player_by_id(action.target_id)
                if target:
                    self.force_card_loss(game, target.id)
        elif action.action_type == ActionType.ASSASSINATE:
            if player.coins >= 3 and action.target_id:
                player.coins -= 3
                target = game.get_player_by_id(action.target_id)
                if target:
                    self.force_card_loss(game, target.id)
        elif action.action_type == ActionType.STEAL:
            if action.target_id:
                target = game.get_player_by_id(action.target_id)
                if target and target.coins >= 2:
                    target.coins -= 2
                    player.coins += 2
                elif target and target.coins == 1:
                    target.coins -= 1
                    player.coins += 1
        elif action.action_type == ActionType.TAX:
            player.coins += 3
        elif action.action_type == ActionType.EXCHANGE:
            self.exchange_cards(game, player.id)
        
        game.next_turn()
        return True
    
    def force_card_loss(self, game: Game, player_id: str) -> bool:
        player = game.get_player_by_id(player_id)
        if not player:
            return False
        
        # Find unrevealed cards
        unrevealed_cards = [card for card in player.cards if not card.is_revealed]
        if not unrevealed_cards:
            player.is_alive = False
            return False
        
        # For now, randomly reveal a card (in real game, player chooses)
        card_to_reveal = random.choice(unrevealed_cards)
        card_to_reveal.is_revealed = True
        
        # Check if player is out
        if all(card.is_revealed for card in player.cards):
            player.is_alive = False
        
        return True
    
    def exchange_cards(self, game: Game, player_id: str) -> bool:
        player = game.get_player_by_id(player_id)
        if not player:
            return False
        
        # Take back unrevealed cards and draw new ones
        unrevealed_cards = [card for card in player.cards if not card.is_revealed]
        for card in unrevealed_cards:
            player.cards.remove(card)
            game.deck.append(card)
        
        # Draw new cards
        cards_to_draw = min(len(unrevealed_cards), len(game.deck))
        for _ in range(cards_to_draw):
            if game.deck:
                player.cards.append(game.deck.pop())
        
        random.shuffle(game.deck)
        return True
    
    def challenge_action(self, game_id: str, challenge: Challenge) -> bool:
        game = self.games.get(game_id)
        if not game:
            return False
        
        challenger = game.get_player_by_id(challenge.challenger_id)
        challenged = game.get_player_by_id(challenge.challenged_id)
        
        if not challenger or not challenged:
            return False
        
        # For now, simplify: random outcome
        # In real game, check if challenged player actually has the card
        challenge_success = random.choice([True, False])
        
        if challenge_success:
            # Challenger wins, challenged loses a card
            self.force_card_loss(game, challenged.id)
        else:
            # Challenger loses a card
            self.force_card_loss(game, challenger.id)
        
        return True
    
    def get_game_state(self, game_id: str) -> Optional[Game]:
        return self.games.get(game_id)
