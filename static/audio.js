/**
 * Audio Manager for COUP Game
 * Handles background music for lobby and in-game states
 * Now with better browser autoplay support
 */

class AudioManager {
  constructor() {
    this.gameAudio = null;
    this.currentTrack = null;
    this.isMuted = false;
    this.volume = 0.35; // Default 35%
    this.initialized = false;
    this.autoplayAllowed = false;

    this.initAudio();
    this.setupAutoplayTrigger();
  }

  setupAutoplayTrigger() {
    // Listen for any user interaction to enable autoplay for browser policy
    const triggerAutoplay = () => {
      this.autoplayAllowed = true;
      // Remove listeners after first interaction
      document.removeEventListener("click", triggerAutoplay);
      document.removeEventListener("keydown", triggerAutoplay);
      document.removeEventListener("touchstart", triggerAutoplay);
    };

    document.addEventListener("click", triggerAutoplay, { once: true });
    document.addEventListener("keydown", triggerAutoplay, { once: true });
    document.addEventListener("touchstart", triggerAutoplay, { once: true });
  }

  initAudio() {
    try {
      // Create audio element for in-game music only
      this.gameAudio = document.createElement("audio");
      this.gameAudio.id = "gameAudio";
      this.gameAudio.loop = true;
      this.gameAudio.volume = this.volume;
      this.gameAudio.preload = "auto";
      this.gameAudio.src = "/static/audio/inGame.mp3";

      document.body.appendChild(this.gameAudio);

      this.initialized = true;
      console.log("✓ Audio Manager initialized");
    } catch (e) {
      console.warn("Audio initialization error:", e);
    }
  }

  createPlaceholderAudio(type) {
    console.log(`Creating placeholder audio for ${type}...`);
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const duration = 10;
    const sampleRate = audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    if (type === "lobby") {
      // Ambient drone (calm)
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const fadeIn = Math.min(1, t / 1);
        const fadeOut = Math.max(0, 1 - Math.max(0, t - 8) / 2);
        data[i] = (Math.sin(2 * Math.PI * 55 * t) * 0.3 + Math.sin(2 * Math.PI * 110 * t) * 0.2 + Math.sin(2 * Math.PI * 55 * t * 1.5) * 0.15) * fadeIn * fadeOut * 0.2;
      }
    } else {
      // Energetic beat pattern (game)
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const beatPhase = (t * 2) % 1;
        data[i] = (Math.sin(2 * Math.PI * 110 * t) * 0.35 + Math.sin(2 * Math.PI * 220 * t) * 0.25 + Math.sin(2 * Math.PI * 165 * t) * 0.2 + (beatPhase < 0.1 ? 0.1 : 0)) * 0.25;
      }
    }

    const audioElement = type === "lobby" ? this.lobbyAudio : this.gameAudio;
    const blob = this.bufferToWave(buffer);
    const url = URL.createObjectURL(blob);
    audioElement.src = url;
  }

  bufferToWave(buffer) {
    const data = buffer.getChannelData(0);
    const wav = this.encodeWAV(data, buffer.sampleRate);
    return new Blob([wav], { type: "audio/wav" });
  }

  encodeWAV(samples, sampleRate) {
    const frame = Math.min(samples.length, sampleRate * 30); // Cap at 30 seconds
    const offset = 0;
    const dataLength = frame * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    let index = 44;
    for (let i = 0; i < frame; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      index += 2;
    }

    return buffer;
  }

  playGame() {
    if (!this.initialized) return;
    // Only play if not already playing game audio
    if (this.currentTrack === "game" && !this.gameAudio.paused) {
      return; // Already playing game, don't restart
    }
    // Stop other tracks
    this.currentTrack = "game"; // Set track immediately
    if (!this.isMuted && this.gameAudio) {
      this.gameAudio.currentTime = 0;
      const playPromise = this.gameAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          console.log("Game autoplay prevented");
        });
      }
    }
  }

  stopAll(resetTrack = true) {
    if (this.gameAudio) this.gameAudio.pause();
    if (resetTrack) this.currentTrack = null;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.isMuted) {
      // Pause but remember what was playing so we can resume
      this.stopAll(false);
    } else {
      // Resume the last track
      if (this.currentTrack === "game") {
        if (this.gameAudio) {
          this.gameAudio.currentTime = 0;
          const playPromise = this.gameAudio.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              console.log("Game play failed on unmute");
            });
          }
        }
      }
    }
    this.updateMuteButton();
    return this.isMuted;
  }

  setVolume(level) {
    this.volume = Math.max(0, Math.min(1, level));
    if (this.lobbyAudio) this.lobbyAudio.volume = this.volume;
    if (this.gameAudio) this.gameAudio.volume = this.volume;
    localStorage.setItem("gameVolume", this.volume);
  }

  updateMuteButton() {
    const btn = document.getElementById("muteBtn");
    if (btn) {
      btn.innerHTML = this.isMuted ? "🔇 Unmute" : "🔊 Mute";
      btn.classList.toggle("bg-red-600", this.isMuted);
      btn.classList.toggle("bg-gray-700", !this.isMuted);
    }
  }

  createControlsUI() {
    const controls = document.createElement("div");
    controls.id = "audioControls";
    controls.className = "fixed top-4 left-4 bg-gray-800 rounded-lg p-4 shadow-lg z-40 max-w-xs";
    controls.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <button id="muteBtn" class="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition">
          🔊 Mute
        </button>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-gray-400">Volume:</label>
        <input type="range" id="volumeSlider" min="0" max="100" value="${Math.round(this.volume * 100)}" 
               class="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
        <span id="volumeValue" class="text-xs text-gray-400 w-6">${Math.round(this.volume * 100)}%</span>
      </div>
    `;
    return controls;
  }
}

// Initialize audio manager
let audioManager = null;

function initAudioSystem() {
  if (!audioManager) {
    audioManager = new AudioManager();
  }
}

function initAudioControls() {
  if (!audioManager) return;

  // Remove existing controls if any
  const existingControls = document.getElementById("audioControls");
  if (existingControls) {
    existingControls.remove();
  }

  // Add controls to page
  const controls = audioManager.createControlsUI();
  document.body.appendChild(controls);

  // Setup event listeners
  document.getElementById("muteBtn").addEventListener("click", () => {
    audioManager.toggleMute();
  });

  document.getElementById("volumeSlider").addEventListener("input", (e) => {
    const vol = parseInt(e.target.value) / 100;
    audioManager.setVolume(vol);
    document.getElementById("volumeValue").textContent = e.target.value + "%";
  });

  // Load saved volume preference
  const savedVolume = localStorage.getItem("gameVolume");
  if (savedVolume) {
    audioManager.setVolume(parseFloat(savedVolume));
  }
}

// Initialize audio system when page loads (but don't start playing yet)
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    initAudioSystem();
    // Audio will only start when entering lobby
  }, 100);
});
