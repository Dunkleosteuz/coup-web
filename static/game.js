let playerId = null,
  roomCode = null,
  ws = null,
  nickname = null,
  pendingRoomCode = null;
let lobbyPoll = null;
let actionLog = [];
let pendingAction = null;
let reactionTimer = null;
let lastGameState = null;
let isInWaitingLobby = false; // Track if we're in waiting lobby to avoid repeated audio plays
let handRevealShown = false;
let lastHandSignature = null;

// Asset mapping for each card role
const CARD_IMAGES = {
  duke: "/static/assets/duke.png",
  assassin: "/static/assets/assasin.png", // filename uses single "s" in assets
  assasin: "/static/assets/assasin.png",
  captain: "/static/assets/captain.png",
  ambassador: "/static/assets/ambassador.png",
  contessa: "/static/assets/contessa.png",
};

// Helper to resolve an image for a given card name
function getCardImage(cardName) {
  if (!cardName) return null;
  const normalized = String(cardName).trim().toLowerCase();
  const direct = CARD_IMAGES[normalized];
  if (direct) return direct;
  // Fallback to non-/static path in case server mounts assets differently
  const filename = normalized.replace(/\s+/g, "");
  return `/assets/${filename}.png`;
}

let loginState = {
  username: "",
  password: "",
  email: "",
  nickname: "",
};

// COUP Game Rules
const GAME_RULES = {
  cards: {
    Duke: {
      emoji: "👑",
      actions: ["Tax (+3 coins)", "Block Foreign Aid"],
      color: "from-blue-600 to-blue-800",
      image: getCardImage("Duke"),
    },
    Assassin: {
      emoji: "🗡️",
      actions: ["Assassinate (-3 coins, target loses card)"],
      color: "from-red-600 to-red-800",
      image: getCardImage("Assassin"),
    },
    Captain: {
      emoji: "⚓",
      actions: ["Steal (up to 2 coins)", "Block Steal action"],
      color: "from-yellow-600 to-yellow-800",
      image: getCardImage("Captain"),
    },
    Ambassador: {
      emoji: "🤝",
      actions: ["Exchange (swap card with deck)", "Block Steal action"],
      color: "from-green-600 to-green-800",
      image: getCardImage("Ambassador"),
    },
    Contessa: {
      emoji: "🎭",
      actions: ["Block Assassinate"],
      color: "from-purple-600 to-purple-800",
      image: getCardImage("Contessa"),
    },
  },
  actions: {
    Income: "Collect 1 coin. Not blockable.",
    "Foreign Aid": "Collect 2 coins. Blockable by Duke.",
    Tax: "Claim Duke, collect 3 coins. Challengeable.",
    Coup: "Pay 7 coins, target loses card. Not blockable.",
    Assassinate: "Pay 3 coins, claim Assassin, target loses card. Blockable by Contessa.",
    Steal: "Claim Captain, steal up to 2 coins. Blockable by Captain/Ambassador.",
    Exchange: "Claim Ambassador, swap card with deck. Challengeable.",
  },
};

function showNotification(msg, type = "info") {
  if (typeof msg === "object") {
    msg = msg.detail || msg.message || JSON.stringify(msg);
  }
  const notif = document.createElement("div");
  notif.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 ${type === "success" ? "bg-green-600" : type === "error" ? "bg-red-600" : "bg-blue-600"}`;
  notif.textContent = msg;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

function resetHandRevealState() {
  handRevealShown = false;
  lastHandSignature = null;
}

function renderCardThumbnail(cardName, { revealed = true, isSelf = false, size = "md" } = {}) {
  const img = cardName ? getCardImage(cardName) : null;
  const label = cardName || "Hidden";
  const canShow = revealed || isSelf;
  const sizeClass = size === "lg" ? "card-thumb-lg" : size === "sm" ? "card-thumb-sm" : "card-thumb";
  const stateClass = revealed ? "card-thumb-lost" : "";
  const back = `<div class="card-thumb-face card-back ${sizeClass} ${stateClass}">🂠</div>`;
  const face = `
    <div class="card-thumb-face ${sizeClass} ${stateClass}" ${canShow ? "onclick=\"showCardPreview('" + (cardName || "") + "')\"" : ""}>
      ${img ? `<div class="card-thumb-art" style="background-image:url('${img}')"></div>` : ""}
      <div class="card-thumb-title">${canShow ? label : "Hidden"}</div>
    </div>`;
  return canShow ? face : back;
}

function showCardPreview(cardName) {
  if (!cardName) return;
  const img = getCardImage(cardName);
  const modal = document.createElement("div");
  modal.id = "cardPreviewModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50";
  modal.innerHTML = `
    <div class="card-preview shadow-2xl">
      <div class="card-preview-art" style="${img ? `background-image:url('${img}')` : ""}"></div>
      <div class="card-preview-info">
        <div class="card-preview-title">${cardName}</div>
        <button class="card-preview-close" onclick="document.getElementById('cardPreviewModal')?.remove()">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target.id === "cardPreviewModal") modal.remove();
  });
}

function showHandRevealModal(hand) {
  if (!Array.isArray(hand) || hand.length === 0) return;
  const modal = document.createElement("div");
  modal.id = "handRevealModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4";
  const cardsHtml = hand
    .filter(Boolean)
    .map(
      (card) => `
      <div class="hand-reveal-card">
        <div class="hand-reveal-art" style="background-image:url('${getCardImage(card) || ""}')"></div>
        <div class="hand-reveal-title">${card}</div>
      </div>
    `,
    )
    .join("");
  modal.innerHTML = `
    <div class="hand-reveal-panel">
      <div class="hand-reveal-header">Kartu Anda</div>
      <div class="hand-reveal-grid">${cardsHtml}</div>
      <button class="hand-reveal-btn" onclick="document.getElementById('handRevealModal')?.remove()">OK, Mulai!</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target.id === "handRevealModal") modal.remove();
  });
}

function maybeShowHandReveal(gameState) {
  if (!gameState || !gameState.game) return;
  const status = gameState.game.status;
  const started = typeof status === "undefined" ? true : status === "started";
  if (!started) return;
  const players = Array.isArray(gameState.players) ? gameState.players : [];
  const self = players.find((p) => String(p.user_id) === String(playerId) || String(p.guest_id) === String(playerId) || String(p.id) === String(playerId));
  if (!self || !Array.isArray(self.hand)) return;
  const hand = self.hand.filter(Boolean);
  const signature = `${gameState.game.room_code || ""}-${hand.join("|")}`;
  if (!handRevealShown && hand.length > 0 && signature !== lastHandSignature) {
    showHandRevealModal(hand);
    handRevealShown = true;
    lastHandSignature = signature;
    return;
  }
  lastHandSignature = signature;
}

function showRulesModal() {
  const modal = document.createElement("div");
  modal.id = "rulesModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 overflow-y-auto";
  modal.innerHTML = `
    <div class="bg-gray-900 rounded-lg p-6 max-w-3xl w-full m-4 max-h-[85vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-yellow-400">🃏 COUP - Game Rules</h2>
        <button onclick="document.getElementById('rulesModal').remove()" class="text-2xl text-white hover:text-red-500">✕</button>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <h3 class="text-lg font-bold text-blue-400 mb-2">💳 Cards</h3>
          ${Object.entries(GAME_RULES.cards)
            .map(
              ([card, info]) => `
            <div class="mb-3 p-3 bg-gray-800 rounded flex gap-3 items-center">
              <div class="rules-card-thumb" style="background-image:url('${info.image || ""}')"></div>
              <div>
                <div class="text-lg font-bold text-white">${info.emoji} ${card}</div>
                <div class="flex flex-wrap gap-2 mt-2">
                  ${info.actions.map((a) => `<span class="rules-chip">${a}</span>`).join("")}
                </div>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
        
        <div>
          <h3 class="text-lg font-bold text-green-400 mb-2">⚡ Actions</h3>
          ${Object.entries(GAME_RULES.actions)
            .map(
              ([action, desc]) => `
            <div class="mb-2 p-2 bg-gray-800 rounded text-sm">
              <div class="font-bold text-white">${action}</div>
              <div class="text-gray-300">${desc}</div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
      
      <div class="bg-gray-800 p-3 rounded mb-3">
        <h3 class="font-bold text-yellow-300 mb-2">📋 How to Play</h3>
        <ul class="text-sm text-gray-300 space-y-1">
          <li>✓ Each player starts with 2 cards and 2 coins</li>
          <li>✓ Take turns performing actions</li>
          <li>✓ Other players can Challenge or Block (60s window)</li>
          <li>✓ Challenges: prove you have the card you claimed</li>
          <li>✓ Blocks: use specific card to stop action</li>
          <li>✓ When challenged/blocked, loser chooses which card to discard</li>
          <li>✓ Last player with cards wins!</li>
        </ul>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target.id === "rulesModal") modal.remove();
  });
}

// Credits modal showing project authors and course info
function showCreditsModal() {
  const modal = document.createElement("div");
  modal.id = "creditsModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 overflow-y-auto";
  modal.innerHTML = `
    <div class="bg-gray-900 rounded-lg p-6 max-w-xl w-full m-4">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-yellow-400">✨ Project Credits</h2>
        <button onclick="document.getElementById('creditsModal').remove()" class="text-2xl text-white hover:text-red-500">✕</button>
      </div>

      <div class="space-y-3 mb-4">
        <div class="flex items-center gap-3 p-3 bg-gray-800 rounded">
          <span class="text-2xl">👨‍💻</span>
          <div>
            <div class="text-white font-semibold">Jeremiah Gerard</div>
            <div class="text-gray-300 text-sm">55230126</div>
          </div>
        </div>
        <div class="flex items-center gap-3 p-3 bg-gray-800 rounded">
          <span class="text-2xl">👨‍💻</span>
          <div>
            <div class="text-white font-semibold">Muhammad Syahrul</div>
            <div class="text-gray-300 text-sm">54200143</div>
          </div>
        </div>
        <div class="flex items-center gap-3 p-3 bg-gray-800 rounded">
          <span class="text-2xl">👨‍💻</span>
          <div>
            <div class="text-white font-semibold">Nathan Tanoko</div>
            <div class="text-gray-300 text-sm">54220082</div>
          </div>
        </div>
        <div class="flex items-center gap-3 p-3 bg-gray-800 rounded">
          <span class="text-2xl">👨‍💻</span>
          <div>
            <div class="text-white font-semibold">Timothy Henseputra</div>
            <div class="text-gray-300 text-sm">57220056</div>
          </div>
        </div>
      </div>

      <div class="p-3 bg-gray-800 rounded mb-3">
        <div class="text-white font-bold mb-1">📚 Mata Kuliah</div>
        <div class="text-gray-300">Aplikasi Perancangan Program Game</div>
      </div>
      <div class="p-3 bg-gray-800 rounded">
        <div class="text-white font-bold mb-1">🎓 Dosen</div>
        <div class="text-gray-300">Bram Bravo, A.md.,S.Kom.,M.Kom.</div>
      </div>

      <div class="mt-4 text-center text-gray-400 text-sm">© 2026 Coup Game — Team Project</div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target.id === "creditsModal") modal.remove();
  });
}

function renderLogin() {
  document.body.style.background = "linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)";
  document.getElementById("app").innerHTML = `
    <div class="flex flex-col items-center justify-center min-h-screen">
      <div class="max-w-md w-full bg-white bg-opacity-10 rounded-2xl p-8 shadow-2xl animate-fadein">
        <div class="flex flex-col items-center mb-6">
          <div style="font-size:3rem;" class="mb-2">🃏</div>
          <h1 class="text-4xl font-extrabold mb-1 text-yellow-400 drop-shadow">Coup</h1>
          <h2 class="text-lg font-semibold text-white">Multiplayer Card Game</h2>
        </div>
        <div class="bg-white bg-opacity-20 rounded-lg p-6 mb-4">
          <h3 class="text-2xl font-bold mb-4 text-center text-white">Enter Your Name</h3>
          <input id="nickname" style="color:#111" class="w-full mb-4 p-3 rounded-lg focus:ring-2 focus:ring-yellow-400 text-lg" placeholder="Your Nickname" value="${loginState.nickname}" oninput="loginState.nickname=this.value" onkeypress="if(event.key==='Enter') guest()">
          <button onclick="guest()" class="w-full py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white font-bold rounded-lg shadow-lg hover:scale-105 transition text-lg">Start Playing</button>
          <div class="grid grid-cols-2 gap-2 mt-2">
            <button onclick="showRulesModal()" class="py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">📖 View Rules</button>
            <button onclick="showCreditsModal()" class="py-2 bg-fuchsia-600 text-white rounded-lg hover:bg-fuchsia-700">✨ Credits</button>
          </div>
        </div>
        <div class="text-center text-white text-xs opacity-80">&copy; 2026 Coup Game</div>
      </div>
    </div>
    <style>
      .animate-fadein { animation: fadein 1s; }
      @keyframes fadein { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      .shadow-2xl { box-shadow: 0 8px 32px 0 rgba(0,0,0,0.25); }
    </style>
  `;
}

function renderLobby() {
  document.getElementById("app").innerHTML = `
    <div class="max-w-md mx-auto bg-black bg-opacity-50 rounded-lg p-6">
      <h2 class="text-2xl font-bold mb-4 text-center">Game Lobby</h2>
      <input id="room_code" style="color:#111; text-transform:uppercase" class="w-full mb-2 p-2 rounded" placeholder="Room Code or click Generate">
      <div class="flex gap-2 mb-2">
        <button onclick="generateRoomCode()" class="flex-1 py-2 bg-yellow-500 text-black rounded">Generate Code</button>
        <button onclick="copyRoomCode()" class="py-2 px-3 bg-gray-700 text-white rounded">Copy</button>
      </div>
      <button onclick="createGame()" class="w-full py-2 bg-green-600 rounded mb-2">Create Game</button>
      <button onclick="joinGame()" class="w-full py-2 bg-blue-600 rounded mb-2">Join Game</button>
      <div class="grid grid-cols-2 gap-2 mb-2">
        <button onclick="showRulesModal()" class="py-2 bg-purple-600 rounded">📖 View Rules</button>
        <button onclick="showCreditsModal()" class="py-2 bg-pink-600 rounded">✨ Credits</button>
      </div>
      <div id="lobbyInfo" class="mt-4 text-center"></div>
    </div>
  `;

  // Audio will only start when game begins (manager already initialized at page load)
}

function renderGameBoard(gameState) {
  lastGameState = gameState;
  const players = Array.isArray(gameState.players) ? gameState.players : [];
  const game = gameState.game || {};
  const turnIndex = typeof game.turn === "number" ? game.turn : null;
  const currentTurnPlayer = turnIndex !== null && players[turnIndex] ? players[turnIndex] : null;
  const currentTurnName = currentTurnPlayer ? currentTurnPlayer.nickname || "Anonymous" : "-";
  const isSelfTurn = currentTurnPlayer && (String(currentTurnPlayer.user_id) === String(playerId) || String(currentTurnPlayer.guest_id) === String(playerId) || String(currentTurnPlayer.id) === String(playerId));
  const deckCount =
    typeof game.deck_count === "number"
      ? game.deck_count
      : Array.isArray(game.deck)
        ? game.deck.length
        : typeof game.deck === "string"
          ? (function () {
              try {
                return JSON.parse(game.deck || "[]").length;
              } catch (e) {
                return 0;
              }
            })()
          : 0;

  maybeShowHandReveal(gameState);

  let html = `<div class="max-w-4xl mx-auto bg-black bg-opacity-50 rounded-lg p-6">`;

  // Header with turn info
  html += `<div class="text-center mb-4 p-3 bg-gray-900 rounded-lg border-2 border-yellow-500">`;
  html += `<h2 class="text-2xl font-bold">
    <span class="text-gray-400">Giliran: </span>
    <span class="text-yellow-400">${currentTurnName}</span>
  </h2>`;
  if (isSelfTurn) {
    html += `<div class="mt-2 px-4 py-2 bg-green-600 rounded-lg inline-block text-white font-bold" style="animation: pulse 2s infinite;">🎯 GILIRAN ANDA!</div>`;
  }
  html += `</div>`;

  // Deck display
  html += `<div class="mb-4 p-3 bg-gray-900 rounded-lg">
    <div class="text-gray-300">🂠 Deck: ${deckCount} kartu</div>
    <div class="flex flex-wrap gap-1 mt-2">${Array(deckCount)
      .fill(0)
      .map(() => '<span class="inline-flex items-center justify-center w-6 h-8 bg-gray-700 rounded-lg text-xs">🂠</span>')
      .join("")}</div>
  </div>`;

  // Trash slot display
  const trash = Array.isArray(game.trash)
    ? game.trash
    : typeof game.trash === "string"
      ? (() => {
          try {
            return JSON.parse(game.trash);
          } catch (e) {
            console.error("Failed to parse trash:", e);
            return [];
          }
        })()
      : [];
  console.log("Rendering trash:", trash, "from game.trash:", game.trash);
  html += `<div class="mb-4 p-3 bg-red-900 bg-opacity-40 rounded-lg border-2 border-red-600">
    <div class="text-red-300 font-bold">🗑️ Trash (Graveyard): ${trash.length} kartu</div>
    <div class="flex flex-wrap gap-2 mt-2">
      ${trash.map((card) => `<span class="inline-flex items-center justify-center px-3 py-1.5 bg-red-800 rounded-lg text-sm font-semibold border border-red-500 text-white">${card}</span>`).join("")}
      ${trash.length === 0 ? '<span class="text-red-400 text-sm italic">Tidak ada kartu terbuang</span>' : ""}
    </div>
  </div>`;

  // Winner announcement
  if (game.game_over && game.winner) {
    html += `<div class="mb-4 p-4 bg-yellow-600 rounded-lg text-center">`;
    html += `<h3 class="text-2xl font-bold text-white">🏆 ${game.winner} MENANG!</h3>`;
    html += `<button onclick="leaveLobby()" class="mt-2 py-2 px-4 bg-blue-600 text-white rounded">Kembali ke Lobby</button>`;
    html += `</div>`;
  }

  // Players grid
  html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">`;
  for (const p of players) {
    const hand = Array.isArray(p.hand) ? p.hand : [];
    const revealed = Array.isArray(p.revealed) ? p.revealed : hand.map(() => false);
    const isSelf = String(p.user_id) === String(playerId) || String(p.guest_id) === String(playerId) || String(p.id) === String(playerId);
    const isCurrentTurn = turnIndex !== null && turnIndex < players.length && String(players[turnIndex].id) === String(p.id);

    html += `
      <div class="player-card bg-gray-800 rounded-lg p-4 ${isSelf ? "border-2 border-yellow-400" : isCurrentTurn ? "border-2 border-cyan-400" : ""} ${!p.is_alive ? "opacity-50" : ""}" data-player-id="${p.guest_id || p.user_id || p.id}">
        <div class="flex justify-between items-center mb-2">
          <div class="font-bold ${isSelf ? "text-yellow-400" : "text-white"}">${p.nickname || "Anonymous"}</div>
          ${isCurrentTurn ? '<span class="text-cyan-400 font-bold">→ TURN</span>' : ""}
        </div>
        <div class="text-sm text-gray-400 mb-2">💰 ${typeof p.coins === "number" ? p.coins : 0} coins</div>
        <div class="mt-2 flex gap-2 mb-2">
          ${hand
            .map((c, i) => {
              const isRev = !!revealed[i];
              return renderCardThumbnail(c || "?", { revealed: isRev, isSelf, size: "sm" });
            })
            .join("")}
        </div>
        <div class="text-xs ${p.is_alive ? "text-green-400" : "text-red-400"}">${p.is_alive ? "✓ Alive" : "✗ Out"}</div>
      </div>
    `;
  }
  html += `</div>`;

  // Target selector
  html += `<select id="target_id" class="w-full mb-2 p-2 rounded bg-gray-700 text-white">
    <option value="">📍 Pilih Target</option>
    ${players
      .filter((p) => !(String(p.user_id) === String(playerId) || String(p.guest_id) === String(playerId) || String(p.id) === String(playerId)) && p.is_alive)
      .map((p) => `<option value="${p.id}">${p.nickname || "Anonymous"}</option>`)
      .join("")}
  </select>`;

  // Action buttons
  html += `
    <div class="mb-4">
      <h3 class="font-bold text-gray-400 mb-2">⚡ Actions:</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button onclick="action('income')" class="py-2 px-2 bg-green-600 rounded text-sm font-bold hover:bg-green-700">💰 Income</button>
        <button onclick="action('foreign_aid')" class="py-2 px-2 bg-blue-600 rounded text-sm font-bold hover:bg-blue-700">🎁 Foreign Aid</button>
        <button onclick="action('tax')" class="py-2 px-2 bg-yellow-600 rounded text-sm font-bold hover:bg-yellow-700">👑 Tax</button>
        <button onclick="action('coup', getTargetId())" class="py-2 px-2 bg-red-600 rounded text-sm font-bold hover:bg-red-700">⚔️ Coup</button>
        <button onclick="action('assassinate', getTargetId())" class="py-2 px-2 bg-purple-600 rounded text-sm font-bold hover:bg-purple-700">🗡️ Assassinate</button>
        <button onclick="action('steal', getTargetId())" class="py-2 px-2 bg-pink-600 rounded text-sm font-bold hover:bg-pink-700">⚓ Steal</button>
        <button onclick="action('exchange')" class="py-2 px-2 bg-indigo-600 rounded text-sm font-bold hover:bg-indigo-700">🤝 Exchange</button>
        <button onclick="showRulesModal()" class="py-2 px-2 bg-gray-600 rounded text-sm font-bold hover:bg-gray-700">📖 Rules</button>
      </div>
    </div>

    <!-- Reaction buttons removed: reactions handled via modal -->

    <div class="mt-4 bg-gray-900 rounded-lg p-3 max-h-40 overflow-y-auto border border-gray-700">
      <h4 class="text-sm font-bold text-gray-300 mb-2">📋 Action Log (Last 5)</h4>
      <div id="actionLogContainer" class="text-xs text-gray-400 space-y-1">
        ${actionLog
          .slice(-5)
          .reverse()
          .map((log) => `<div>• ${log}</div>`)
          .join("")}
      </div>
    </div>
  `;
  html += `</div>`;
  document.getElementById("app").innerHTML = html;

  // Add animations
  if (!document.getElementById("pulseCss")) {
    const style = document.createElement("style");
    style.id = "pulseCss";
    style.textContent = `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }`;
    document.head.appendChild(style);
  }
}

function getTargetId() {
  return document.getElementById("target_id") ? document.getElementById("target_id").value : null;
}

function getSelfPlayer() {
  if (!lastGameState || !Array.isArray(lastGameState.players)) return null;
  const pid = String(playerId || "");
  return lastGameState.players.find((p) => String(p.user_id) === pid || String(p.guest_id) === pid || String(p.id) === pid) || null;
}

function getSelfIds(gameState) {
  const ids = new Set();
  if (playerId) ids.add(String(playerId));
  const players = (gameState && gameState.players) || (lastGameState && lastGameState.players) || [];
  const pid = String(playerId || "");
  const me = players.find((p) => String(p.user_id) === pid || String(p.guest_id) === pid || String(p.id) === pid);
  if (me) {
    if (me.id) ids.add(String(me.id));
    if (me.user_id) ids.add(String(me.user_id));
    if (me.guest_id) ids.add(String(me.guest_id));
  }
  return ids;
}

function isAwaitingCurrentUser(pa, gameState) {
  if (!pa) return false;
  const awaiting = pa.awaiting_from;
  if (awaiting === undefined || awaiting === null) return false;
  const ids = getSelfIds(gameState);
  return ids.has(String(awaiting));
}

function renderCardChoiceModal({ title, subtitle, requiredCard = null }) {
  console.log("renderCardChoiceModal called with:", title, subtitle, requiredCard);
  const modal = document.createElement("div");
  modal.id = "cardSelectionModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50";

  const selfPlayer = getSelfPlayer();
  let hand = selfPlayer && Array.isArray(selfPlayer.hand) ? [...selfPlayer.hand] : [];
  if (!hand || hand.length === 0) hand = [null];

  const buttons = hand
    .map((card, idx) => {
      const label = card || `Kartu ${idx + 1}`;
      const highlight = requiredCard && card === requiredCard ? "border-2 border-yellow-400" : "border border-transparent";
      return `
        <button onclick="selectCard(${idx})" class="flex-1 py-3 px-3 bg-blue-600 text-white rounded-lg font-bold text-lg hover:bg-blue-700 ${highlight}">
          ${label}
        </button>`;
    })
    .join("");

  modal.innerHTML = `
    <div class="bg-gray-800 rounded-lg p-6 max-w-sm w-full">
      <h3 class="text-xl font-bold text-white mb-4">${title}</h3>
      <p class="text-gray-300 mb-4">${subtitle}</p>
      <div class="flex flex-col gap-3">${buttons}</div>
    </div>
  `;
  document.body.appendChild(modal);
}

function showCardSelectionModal(targetNickname) {
  console.log("showCardSelectionModal called for:", targetNickname);
  renderCardChoiceModal({ title: `🎴 ${targetNickname || "Pemain"}`, subtitle: "Pilih 1 kartu untuk dibuang:" });
}

function showExchangeSelectModal() {
  renderCardChoiceModal({ title: "🤝 Pilih Kartu untuk Ditukar", subtitle: "Pilih 1 kartu untuk ditukar dengan deck:" });
}

function showClaimRevealModal(requiredCard) {
  renderCardChoiceModal({
    title: `Buktikan Klaim: ${requiredCard || "?"}`,
    subtitle: `Pilih kartu ${requiredCard || ""} yang akan ditunjukkan:`,
    requiredCard,
  });
}

function selectCard(cardIndex) {
  const modal = document.getElementById("cardSelectionModal");
  if (modal) modal.remove();

  safeFetch("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room_code: roomCode,
      player_id: playerId,
      action_type: "select_card",
      card_index: cardIndex,
    }),
  }).then(({ ok, data, error }) => {
    if (ok && data) {
      showNotification(`Kartu ke-${cardIndex + 1} telah dibuang`, "success");
      if (data.gameState) {
        lastGameState = data.gameState;
        renderGameBoard(data.gameState);
      }
      pendingAction = null;
    } else {
      showNotification((data && (data.detail || data.message)) || error || "Card selection failed", "error");
    }
  });
}

function showReactionWindow(pendingData) {
  const modal = document.createElement("div");
  modal.id = "reactionModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50";

  const isBlockReaction = pendingData.stage === "block_reaction";
  const actorId = isBlockReaction ? pendingData.blocker_id : pendingData.actor_id;
  const actorName = document.querySelector(`[data-player-id="${actorId}"]`)?.textContent || "Player";
  const actionLabel = isBlockReaction
    ? `🛡️ Block dengan ${pendingData.block_card || "Unknown"}`
    : {
        income: "💰 Income",
        foreign_aid: "🎁 Foreign Aid",
        tax: "👑 Tax",
        coup: "⚔️ Coup",
        assassinate: "🗡️ Assassinate",
        steal: "⚓ Steal",
        exchange: "🤝 Exchange",
      }[pendingData.action] || pendingData.action;

  const canBlock = (() => {
    if (isBlockReaction) return false;
    const action = pendingData.action;
    if (!["foreign_aid", "assassinate", "steal"].includes(action)) return false;
    const ids = getSelfIds(lastGameState || { players: [] });
    if (action === "foreign_aid") return !ids.has(String(pendingData.actor_id));
    if (action === "assassinate" || action === "steal") return ids.has(String(pendingData.target_id));
    return false;
  })();

  const canChallenge = (() => {
    if (isBlockReaction) return true;
    const action = pendingData.action;
    const challengeable = ["tax", "assassinate", "steal", "exchange"];
    return challengeable.includes(action);
  })();

  modal.innerHTML = `
    <div class="bg-gray-800 rounded-lg p-6 max-w-md">
      <h3 class="text-xl font-bold text-yellow-400 mb-6">⏱️ Reaction Window (60s)</h3>
      <p class="text-white text-center text-base mb-6">
        <strong>${actorName}</strong> sedang melakukan <strong>${actionLabel}</strong>
      </p>
      <div class="text-6xl font-bold text-red-500 text-center mb-6" id="timerDisplay">60</div>
      <div class="flex gap-2 mb-4">
        ${isBlockReaction ? '<button onclick="reactAction(\'challenge\')" class="flex-1 py-2 bg-orange-600 text-white rounded font-bold hover:bg-orange-700">Challenge Block</button>' : canChallenge ? '<button onclick="reactAction(\'challenge\')" class="flex-1 py-2 bg-orange-600 text-white rounded font-bold hover:bg-orange-700">Challenge</button>' : '<button disabled class="flex-1 py-2 bg-gray-600 text-white rounded font-bold opacity-50 cursor-not-allowed">Tidak Bisa Challenge</button>'}
        ${!isBlockReaction && canBlock ? '<button onclick="reactAction(\'block\')" class="flex-1 py-2 bg-gray-600 text-white rounded font-bold hover:bg-gray-700">Block</button>' : ""}
      </div>
      <button onclick="passReaction()" class="w-full py-2 bg-gray-700 text-white rounded font-bold hover:bg-gray-800">Pass</button>
    </div>
  `;
  document.body.appendChild(modal);

  // Start countdown
  let remaining = 60;
  const timerDisplay = document.getElementById("timerDisplay");
  if (reactionTimer) clearInterval(reactionTimer);
  reactionTimer = setInterval(() => {
    remaining--;
    if (timerDisplay) timerDisplay.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(reactionTimer);
      closeReactionWindow();
    }
  }, 1000);
}

function closeReactionWindow() {
  const modal = document.getElementById("reactionModal");
  if (modal) modal.remove();
  if (reactionTimer) clearInterval(reactionTimer);
  reactionTimer = null;
}

async function reactAction(reactionType) {
  if (!pendingAction) {
    showNotification("Tidak ada pending action", "error");
    return;
  }

  // Block needs card selection; reuse block() flow
  if (reactionType === "block") {
    closeReactionWindow();
    block();
    return;
  }

  closeReactionWindow();

  const { ok, data, error } = await safeFetch("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room_code: roomCode,
      player_id: playerId,
      action_type: reactionType,
    }),
  });

  if (ok && data) {
    showNotification(data.message || `${reactionType} sent`, "success");
    pendingAction = null;
  } else {
    showNotification((data && (data.detail || data.message)) || error || "Reaction failed", "error");
  }
}

async function passReaction() {
  if (!pendingAction) {
    closeReactionWindow();
    showNotification("Tidak ada aksi untuk di-pass", "info");
    return;
  }
  const { ok, data, error } = await safeFetch("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_code: roomCode, player_id: playerId, action_type: "pass" }),
  });
  if (ok && data) {
    pendingAction = null;
    closeReactionWindow();
    if (data.message) showNotification(data.message, "success");
    if (data.gameState) {
      lastGameState = data.gameState;
      renderGameBoard(data.gameState);
    }
  } else {
    showNotification((data && (data.detail || data.message)) || error || "Pass gagal", "error");
  }
}

async function safeFetch(url, options) {
  try {
    const res = await fetch(url, options);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

async function guest() {
  let nick = loginState.nickname ? loginState.nickname.trim() : "";
  if (!nick) {
    showNotification("Masukkan nama Anda", "error");
    return;
  }
  if (nick.length < 2) {
    showNotification("Nama minimal 2 karakter", "error");
    return;
  }
  if (nick.length > 20) {
    showNotification("Nama maksimal 20 karakter", "error");
    return;
  }

  nickname = nick;
  const { ok, data, error } = await safeFetch("/auth/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (ok && data) {
    playerId = data.session_id ?? data.user?.id ?? playerId;
    showNotification(`Selamat datang, ${nickname}!`, "success");
    renderLobby();
  } else {
    showNotification((data && (data.detail || data.message)) || error || "Login gagal", "error");
  }
}

async function createGame() {
  const codeInput = document.getElementById("room_code") ? document.getElementById("room_code").value.trim() : "";
  const createBtn = document.querySelector("button[onclick='createGame()']");
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.textContent = "Membuat...";
  }

  const payload = { host_id: playerId };
  if (codeInput) payload.room_code = codeInput;

  const res = await fetch("/api/game/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (createBtn) {
    createBtn.disabled = false;
    createBtn.textContent = "Create Game";
  }

  if (res.ok && data) {
    roomCode = (data && data.room_code) || codeInput || roomCode;
    showNotification(`Ruangan dibuat: ${roomCode}`, "success");
    await joinGameWithCode(roomCode, nickname);
  } else {
    showNotification((data && (data.detail || data.message)) || `Create failed`, "error");
  }
}

function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  const input = document.getElementById("room_code");
  if (input) input.value = code;
  pendingRoomCode = code;
  showNotification(`Kode dibuat: ${code}`, "success");
}

function copyRoomCode() {
  const input = document.getElementById("room_code");
  const code = (input && input.value) || roomCode || pendingRoomCode;
  if (!code) {
    showNotification("Tidak ada kode untuk disalin", "error");
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(code)
      .then(() => showNotification("Kode disalin", "success"))
      .catch(() => showNotification("Salin gagal", "error"));
  } else {
    try {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showNotification("Kode disalin", "success");
    } catch (e) {
      showNotification("Salin gagal", "error");
    }
  }
}

async function joinGame() {
  const codeEl = document.getElementById("room_code");
  const code = codeEl ? codeEl.value.trim().toUpperCase() : "";
  if (!code) {
    showNotification("Masukkan kode ruangan", "error");
    return;
  }

  const joinBtn = document.querySelector("button[onclick='joinGame()']");
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.textContent = "Bergabung...";
  }

  await joinGameWithCode(code, nickname);

  if (joinBtn) {
    joinBtn.disabled = false;
    joinBtn.textContent = "Join Game";
  }
}

async function joinGameWithCode(code, nick) {
  if (!code || !nick) {
    showNotification("Kode atau nama tidak valid", "error");
    return;
  }

  const { ok, data, error } = await safeFetch("/api/game/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_code: code, player_id: playerId, nickname: nick }),
  });
  if (ok && data) {
    roomCode = code;
    showNotification(`Bergabung: ${roomCode}`, "success");
    connectWS();
    await fetchAndRenderLobbyState();
  } else {
    showNotification((data && (data.detail || data.message)) || error || "Bergabung gagal", "error");
  }
}

function renderWaitingLobby(state) {
  const players = (state && state.players) || [];
  const game = (state && state.game) || {};

  const firstPlayer = players.length > 0 ? players[0] : null;
  const isHost = firstPlayer && playerId && (String(firstPlayer.id) === String(playerId) || String(firstPlayer.user_id) === String(playerId) || String(firstPlayer.guest_id) === String(playerId));
  const canStart = players.length >= 2 && isHost;

  let html = `<div class="max-w-md mx-auto bg-black bg-opacity-50 rounded-lg p-6">`;
  html += `<h2 class="text-2xl font-bold mb-4 text-center">⏳ Lobby Menunggu</h2>`;
  html += `<div class="mb-4"><strong>Ruangan:</strong> <span class="text-yellow-400 font-bold">${game.room_code || roomCode || "-"}</span></div>`;
  html += `<div class="mb-4">
    <h3 class="font-semibold mb-2">👥 Pemain (${players.length})</h3>
    <ul class="space-y-2">`;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const isPlayerHost = i === 0;
    html += `<li class="p-2 bg-gray-800 rounded flex justify-between items-center">
      <span>${p.nickname || p.username || "Anonymous"}</span>
      ${isPlayerHost ? '<span class="text-xs text-yellow-400 font-bold">HOST</span>' : ""}
    </li>`;
  }
  html += `</ul></div>`;

  html += `<div class="flex gap-2 mb-2">`;
  html += `<button onclick="leaveLobby()" class="flex-1 py-2 bg-red-600 text-white rounded">Keluar</button>`;
  if (!isHost) {
    html += `<button disabled class="flex-1 py-2 bg-gray-600 text-white rounded">Menunggu Host</button>`;
  } else {
    if (!canStart) {
      html += `<button disabled class="flex-1 py-2 bg-gray-600 text-white rounded">Butuh 2+ Pemain</button>`;
    } else {
      html += `<button onclick="startGame()" class="flex-1 py-2 bg-green-600 text-white rounded font-bold">▶️ Mulai</button>`;
    }
  }
  html += `</div>`;
  html += `<div class="grid grid-cols-2 gap-2 mt-2">
    <button onclick="showRulesModal()" class="py-2 bg-blue-600 text-white rounded">📖 Lihat Rules</button>
    <button onclick="showCreditsModal()" class="py-2 bg-pink-600 text-white rounded">✨ Credits</button>
  </div>`;
  html += `</div>`;

  document.getElementById("app").innerHTML = html;

  // Audio will only start when game begins, not in lobby
}

async function fetchAndRenderLobbyState() {
  if (!roomCode) return;
  const { ok, data } = await safeFetch(`/api/game/state?room_code=${roomCode}&viewer_id=${encodeURIComponent(playerId || "")}`);
  if (ok && data) {
    if (data.game && data.game.status === "started") {
      stopLobbyPolling();
      renderGameBoard({ game: data.game, players: data.players });
      return;
    }
    renderWaitingLobby(data);
    startLobbyPolling();
  } else {
    showNotification("Gagal load lobby", "error");
  }
}

function startLobbyPolling() {
  stopLobbyPolling();
  lobbyPoll = setInterval(() => {
    if (roomCode) fetchAndRenderLobbyState();
  }, 1500);
}

function stopLobbyPolling() {
  if (lobbyPoll) {
    clearInterval(lobbyPoll);
    lobbyPoll = null;
  }
}

async function startGame() {
  if (!roomCode) return showNotification("Tidak ada ruangan", "error");
  const { ok, data, error } = await safeFetch("/api/game/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_code: roomCode }),
  });
  if (ok) {
    showNotification(data?.message || "Game dimulai", "success");
    isInWaitingLobby = false; // Reset waiting lobby flag
    // Switch to game music
    if (typeof audioManager !== "undefined" && audioManager) {
      audioManager.playGame();
      if (typeof initAudioControls !== "undefined") {
        initAudioControls();
      }
    }
    await fetchAndRenderState();
  } else {
    showNotification((data && (data.detail || data.message)) || error || "Start gagal", "error");
  }
}

function leaveLobby() {
  stopLobbyPolling();
  if (ws) {
    try {
      ws.close();
    } catch (e) {}
    ws = null;
  }
  safeFetch("/api/game/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_code: roomCode, player_id: playerId }),
  }).finally(() => {
    roomCode = null;
    resetHandRevealState();
    // Remove audio controls and stop audio when leaving lobby
    try {
      if (typeof removeAudioControls !== "undefined") {
        removeAudioControls();
      }
    } catch (e) {}
    if (typeof audioManager !== "undefined" && audioManager) {
      audioManager.stopAll();
    }
    renderLobby();
    showNotification("Keluar dari lobby", "info");
  });
}

async function fetchAndRenderState() {
  if (!roomCode) return;
  const { ok, data } = await safeFetch(`/api/game/state?room_code=${roomCode}&viewer_id=${encodeURIComponent(playerId || "")}`);
  if (ok && data && data.players) {
    renderGameBoard({ game: data.game, players: data.players });
  } else if (!ok) {
    showNotification("Gagal fetch state", "error");
  }
}

async function action(type, targetId = null) {
  const { ok, data, error } = await safeFetch("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_code: roomCode, player_id: playerId, action_type: type, target_id: targetId }),
  });
  if (ok && data) {
    if (data.message) {
      actionLog.push(data.message);
      showNotification(data.message, "success");
    }
    if (data.gameState) {
      lastGameState = data.gameState;
      renderGameBoard(data.gameState);
    } else await fetchAndRenderState();
  } else {
    showNotification((data && (data.detail || data.message)) || error || "Aksi gagal", "error");
  }
}

async function challenge() {
  if (!pendingAction) {
    showNotification("Tidak ada aksi untuk di-challenge", "error");
    return;
  }
  // Check if this action can be challenged
  const challengeable = ["tax", "assassinate", "steal", "exchange"];
  if (!challengeable.includes(pendingAction.action)) {
    showNotification(`Aksi ${pendingAction.action} tidak bisa di-challenge`, "error");
    return;
  }
  const { ok, data, error } = await safeFetch("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room_code: roomCode, player_id: playerId, action_type: "challenge" }),
  });
  if (ok && data) {
    showNotification(data.message || "Challenge dikirim", "success");
    pendingAction = null;
    closeReactionWindow();
    if (data.gameState) {
      lastGameState = data.gameState;
      renderGameBoard(data.gameState);
    }
  } else {
    showNotification((data && (data.detail || data.message)) || error || "Challenge gagal", "error");
  }
}

async function block() {
  if (!pendingAction) {
    showNotification("Tidak ada aksi untuk di-block", "error");
    return;
  }

  // Determine which card can block this action
  const action = pendingAction.action;
  let blockCards = [];
  if (action === "foreign_aid") {
    blockCards = ["Duke"];
  } else if (action === "assassinate") {
    blockCards = ["Contessa"];
  } else if (action === "steal") {
    blockCards = ["Captain", "Ambassador"];
  } else {
    showNotification(`Aksi ${action} tidak bisa di-block`, "error");
    return;
  }

  // Show block card selection modal
  showBlockCardModal(blockCards, action);
}

function showBlockCardModal(blockCards, action) {
  const modal = document.createElement("div");
  modal.id = "blockCardModal";
  modal.className = "fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50";

  const buttons = blockCards
    .map(
      (card) => `
    <button onclick="sendBlock('${card}')" class="py-3 px-4 bg-blue-600 text-white rounded-lg font-bold text-lg hover:bg-blue-700">
      ${card}
    </button>
  `,
    )
    .join("");

  modal.innerHTML = `
    <div class="bg-gray-800 rounded-lg p-6 max-w-sm w-full">
      <h3 class="text-xl font-bold text-yellow-400 mb-4">🛡️ Block dengan Kartu</h3>
      <p class="text-gray-300 mb-4">Pilih kartu untuk block ${action}:</p>
      <div class="flex flex-col gap-3">${buttons}</div>
      <button onclick="closeBlockModal()" class="w-full mt-3 py-2 bg-gray-700 text-white rounded font-bold hover:bg-gray-800">Batal</button>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeBlockModal() {
  const modal = document.getElementById("blockCardModal");
  if (modal) modal.remove();
}

async function sendBlock(blockCard) {
  closeBlockModal();

  const { ok, data, error } = await safeFetch("/api/game/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room_code: roomCode,
      player_id: playerId,
      action_type: "block",
      block_card: blockCard,
    }),
  });
  if (ok && data) {
    showNotification(data.message || "Block dikirim", "success");
    pendingAction = null;
    closeReactionWindow();
    if (data.gameState) {
      lastGameState = data.gameState;
      renderGameBoard(data.gameState);
    }
  } else {
    showNotification((data && (data.detail || data.message)) || error || "Block gagal", "error");
  }
}

function connectWS() {
  if (!roomCode) return;
  if (ws && ws.readyState === 1) return;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/api/ws/${roomCode}?player_id=${encodeURIComponent(playerId || "")}`;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    showNotification("WebSocket init gagal", "error");
    return;
  }
  ws.onopen = () => showNotification("Terhubung ke ruangan!", "success");
  ws.onclose = () => {
    showNotification("Terputus dari ruangan", "error");
    ws = null;
  };
  ws.onerror = (e) => showNotification("WebSocket error", "error");
  ws.onmessage = (event) => {
    let msg = null;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      console.warn("Invalid WS message", event.data);
      return;
    }
    if (msg.type === "action" && msg.gameState) {
      lastGameState = msg.gameState;
      if (msg.msg) actionLog.push(msg.msg);
      if (msg.pending_action) {
        console.log("Received pending_action:", msg.pending_action, "playerId:", playerId);
        const awaitingMe = isAwaitingCurrentUser(msg.pending_action, msg.gameState);
        pendingAction = msg.pending_action;
        if (msg.pending_action.stage === "card_selection" && awaitingMe) {
          // Check if it's exchange action
          if (msg.pending_action.action === "exchange") {
            showExchangeSelectModal();
          } else {
            let targetNickname = "Unknown";
            if (msg.gameState && msg.gameState.players) {
              const targetPlayer = msg.gameState.players.find(
                (p) =>
                  (p.guest_id && String(p.guest_id) === String(msg.pending_action.awaiting_from)) ||
                  (p.user_id && String(p.user_id) === String(msg.pending_action.awaiting_from)) ||
                  (p.id && String(p.id) === String(msg.pending_action.awaiting_from)),
              );
              if (targetPlayer) targetNickname = targetPlayer.nickname || "Unknown";
            }
            showCardSelectionModal(targetNickname);
          }
        } else if (msg.pending_action.stage === "reveal_claim" && awaitingMe) {
          const required = msg.pending_action.required_card || "?";
          showClaimRevealModal(required);
        } else if (msg.pending_action.stage === "reaction" && String(msg.pending_action.actor_id) !== String(playerId)) {
          showReactionWindow(msg.pending_action);
        } else if (msg.pending_action.stage === "block_reaction" && String(msg.pending_action.blocker_id) !== String(playerId)) {
          // Show reaction window for challenging the block
          showReactionWindow(msg.pending_action);
        }
      } else {
        closeReactionWindow();
      }
      renderGameBoard(msg.gameState);
    } else if (msg.type === "started" && msg.gameState) {
      resetHandRevealState();
      lastGameState = msg.gameState;
      isInWaitingLobby = false;
      stopLobbyPolling();
      actionLog = [];
      pendingAction = null;
      closeReactionWindow();
      // Start game music
      if (typeof audioManager !== "undefined" && audioManager) {
        audioManager.playGame();
        if (typeof initAudioControls !== "undefined") {
          initAudioControls();
        }
      }
      renderGameBoard(msg.gameState);
    } else if (msg.type === "lobby_update" && msg.players) {
      if (msg.game && msg.game.status === "started") {
        isInWaitingLobby = false;
        stopLobbyPolling();
        actionLog = [];
        pendingAction = null;
        closeReactionWindow();
        resetHandRevealState();
        lastGameState = { game: msg.game, players: msg.players };
        // Start game music when game begins
        if (typeof audioManager !== "undefined" && audioManager) {
          audioManager.playGame();
          if (typeof initAudioControls !== "undefined") {
            initAudioControls();
          }
        }
        renderGameBoard({ game: msg.game, players: msg.players });
      } else {
        // Only show waiting lobby if game hasn't started yet
        if (!lastGameState || !lastGameState.game || lastGameState.game.status !== "started") {
          renderWaitingLobby({ game: msg.game, players: msg.players });
        }
      }
    }
    if (msg.message) showNotification(msg.message, "info");
  };
}

window.onload = () => {
  if (!document.getElementById("app")) {
    const el = document.createElement("div");
    el.id = "app";
    document.body.appendChild(el);
  }
  renderLogin();
};
