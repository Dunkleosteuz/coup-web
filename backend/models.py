from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum

class CardType(str, Enum):
    DUKE = "Duke"
    ASSASSIN = "Assassin"
    CAPTAIN = "Captain"
    AMBASSADOR = "Ambassador"
    CONTESSA = "Contessa"

class ActionType(str, Enum):
    INCOME = "income"
    FOREIGN_AID = "foreign_aid"
    COUP = "coup"
    TAX = "tax"
    ASSASSINATE = "assassinate"
    STEAL = "steal"
    EXCHANGE = "exchange"

class Card(BaseModel):
    type: CardType
    is_revealed: bool = False

class Player(BaseModel):
    id: str
    name: str
    coins: int = 2
    cards: List[Card] = Field(default_factory=list)
    is_alive: bool = True

class GameAction(BaseModel):
    player_id: str
    action_type: ActionType
    target_id: Optional[str] = None
    card_type: Optional[CardType] = None

class Challenge(BaseModel):
    challenger_id: str
    challenged_id: str
    action_type: ActionType

class Game(BaseModel):
    id: str
    players: List[Player] = Field(default_factory=list)
    current_player_index: int = 0
    deck: List[Card] = Field(default_factory=list)
    game_started: bool = False
    game_over: bool = False
    winner: Optional[str] = None
    
    def get_current_player(self) -> Optional[Player]:
        if self.current_player_index < len(self.players):
            return self.players[self.current_player_index]
        return None
    
    def get_player_by_id(self, player_id: str) -> Optional[Player]:
        for player in self.players:
            if player.id == player_id:
                return player
        return None
    
    def next_turn(self):
        alive_players = [p for p in self.players if p.is_alive]
        if len(alive_players) <= 1:
            self.game_over = True
            if alive_players:
                self.winner = alive_players[0].id
            return
        
        # Find next alive player
        original_index = self.current_player_index
        while True:
            self.current_player_index = (self.current_player_index + 1) % len(self.players)
            if self.players[self.current_player_index].is_alive:
                break
            if self.current_player_index == original_index:
                break

class GameRoom(BaseModel):
    room_id: str
    game: Optional[Game] = None
    max_players: int = 6
    host_id: str
    players: List[Player] = Field(default_factory=list)
