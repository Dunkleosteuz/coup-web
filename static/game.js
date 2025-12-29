class CoupGame {
    constructor() {
        this.gameId = null;
        this.playerId = null;
        this.ws = null;
        this.gameState = null;
        this.isMyTurn = false;
    }

    async createGame() {
        try {
            const response = await fetch('/api/game/create', { method: 'POST' });
            const data = await response.json();
            this.gameId = data.game_id;
            document.getElementById('gameId').value = this.gameId;
            this.showNotification('Game created! Share this ID with friends.', 'success');
        } catch (error) {
            this.showNotification('Failed to create game', 'error');
        }
    }

    async joinGame() {
        const playerName = document.getElementById('playerName').value.trim();
        const gameId = document.getElementById('gameId').value.trim();

        if (!playerName || !gameId) {
            this.showNotification('Please enter your name and game ID', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/game/${gameId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_name: playerName })
            });

            if (!response.ok) {
                throw new Error('Failed to join game');
            }

            const data = await response.json();
            this.gameId = gameId;
            this.playerId = data.player_id;

            document.getElementById('gameSetup').classList.add('hidden');
            document.getElementById('gameLobby').classList.remove('hidden');
            document.getElementById('lobbyGameId').textContent = gameId;

            this.connectWebSocket();
            this.updatePlayersList();
            this.showNotification('Joined game successfully!', 'success');
        } catch (error) {
            this.showNotification('Failed to join game', 'error');
        }
    }

    async startGame() {
        try {
            const response = await fetch(`/api/game/${this.gameId}/start`, { method: 'POST' });
            
            if (!response.ok) {
                throw new Error('Failed to start game');
            }

            this.showNotification('Game starting!', 'success');
        } catch (error) {
            this.showNotification('Failed to start game', 'error');
        }
    }

    connectWebSocket() {
        const wsUrl = `ws://localhost:8000/api/ws/${this.gameId}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('Connected to game');
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };

        this.ws.onclose = () => {
            console.log('Disconnected from game');
        };
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'player_joined':
                this.updatePlayersList();
                break;
            case 'game_started':
                this.gameState = message.game_state;
                this.showGameBoard();
                break;
            case 'action_performed':
                this.gameState = message.game_state;
                this.updateGameBoard();
                break;
            case 'challenge_performed':
                this.gameState = message.game_state;
                this.updateGameBoard();
                break;
        }
    }

    async performAction(actionType, targetId = null) {
        if (!this.isMyTurn) {
            this.showNotification("It's not your turn!", 'error');
            return;
        }

        try {
            const response = await fetch(`/api/game/${this.gameId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    player_id: this.playerId,
                    action_type: actionType,
                    target_id: targetId
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to perform action');
            }

            this.showNotification('Action performed!', 'success');
        } catch (error) {
            this.showNotification(error.message, 'error');
        }
    }

    showGameBoard() {
        document.getElementById('gameLobby').classList.add('hidden');
        document.getElementById('gameBoard').classList.remove('hidden');
        this.updateGameBoard();
    }

    updateGameBoard() {
        if (!this.gameState) return;

        // Update current player
        const currentPlayer = this.gameState.players[this.gameState.current_player_index];
        document.getElementById('currentPlayer').textContent = currentPlayer.name;

        // Update your coins
        const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (myPlayer) {
            document.getElementById('yourCoins').textContent = myPlayer.coins;
            this.isMyTurn = currentPlayer.id === this.playerId;
        }

        // Update players grid
        this.updatePlayersGrid();

        // Update your cards
        this.updateYourCards();

        // Check for game over
        if (this.gameState.game_over) {
            this.showGameOver();
        }
    }

    updatePlayersGrid() {
        const grid = document.getElementById('playersGrid');
        grid.innerHTML = '';

        this.gameState.players.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = `player-card bg-gray-800 rounded-lg p-4 ${player.id === this.playerId ? 'border-2 border-yellow-400' : ''} ${!player.is_alive ? 'opacity-50' : ''}`;
            
            const cards = player.cards.map(card => 
                `<span class="inline-block px-2 py-1 bg-gray-700 rounded text-xs mr-1 ${card.is_revealed ? 'line-through' : ''}">${card.type}</span>`
            ).join('');

            playerDiv.innerHTML = `
                <div class="font-bold ${player.id === this.playerId ? 'text-yellow-400' : 'text-white'}">${player.name}</div>
                <div class="text-sm text-gray-400">Coins: ${player.coins}</div>
                <div class="mt-2">${cards}</div>
                <div class="text-xs mt-1 ${player.is_alive ? 'text-green-400' : 'text-red-400'}">${player.is_alive ? 'Alive' : 'Out'}</div>
            `;

            grid.appendChild(playerDiv);
        });
    }

    updateYourCards() {
        const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
        if (!myPlayer) return;

        const cardsDiv = document.getElementById('yourCards');
        cardsDiv.innerHTML = '';

        myPlayer.cards.forEach(card => {
            const cardDiv = document.createElement('div');
            cardDiv.className = `card bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg p-4 text-center min-w-[100px] ${card.is_revealed ? 'opacity-50' : ''}`;
            cardDiv.innerHTML = `
                <div class="font-bold text-lg">${card.type}</div>
                <div class="text-xs mt-1">${card.is_revealed ? 'Revealed' : 'Hidden'}</div>
            `;
            cardsDiv.appendChild(cardDiv);
        });
    }

    updatePlayersList() {
        if (!this.gameId) return;

        fetch(`/api/game/${this.gameId}/players`)
            .then(response => response.json())
            .then(players => {
                const list = document.getElementById('playersList');
                list.innerHTML = '';

                players.forEach(player => {
                    const playerDiv = document.createElement('div');
                    playerDiv.className = 'bg-gray-800 rounded p-2';
                    playerDiv.innerHTML = `<span class="font-medium">${player.name}</span>`;
                    list.appendChild(playerDiv);
                });
            });
    }

    showGameOver() {
        const winner = this.gameState.players.find(p => p.id === this.gameState.winner);
        document.getElementById('gameBoard').classList.add('hidden');
        document.getElementById('gameOver').classList.remove('hidden');
        document.getElementById('winnerName').textContent = winner ? winner.name : 'Unknown';
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 ${
            type === 'success' ? 'bg-green-600' : 
            type === 'error' ? 'bg-red-600' : 
            'bg-blue-600'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Global functions for HTML onclick handlers
let game;

function createGame() {
    game.createGame();
}

function joinGame() {
    game.joinGame();
}

function startGame() {
    game.startGame();
}

function performAction(actionType) {
    // For actions that need targets, you could show a selection modal
    if (actionType === 'steal' || actionType === 'assassinate' || actionType === 'coup') {
        // Simplified: just perform without target for now
        game.performAction(actionType);
    } else {
        game.performAction(actionType);
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    game = new CoupGame();
});
