#!/usr/bin/env python3
"""
Generate background music for COUP Game
Creates high-quality synthesized tracks optimized for the game
"""

import wave
import math
import struct

def generate_lobby_audio_advanced(output_file, duration=60, sample_rate=44100):
    """
    Generate advanced ambient lobby music
    Mysterious and calm - perfect for strategic card game lobby
    """
    frames = int(duration * sample_rate)
    samples = []
    
    for i in range(frames):
        t = i / sample_rate
        
        # Multiple layered sine waves for ambient effect
        # Base frequency: 55 Hz (A1)
        bass1 = math.sin(2 * math.pi * 55 * t) * 0.15
        
        # Second layer: 110 Hz (A2)
        bass2 = math.sin(2 * math.pi * 110 * t) * 0.12
        
        # Third layer with slight modulation
        bass3 = math.sin(2 * math.pi * 82.4 * t) * 0.1
        
        # Add subtle pulsing envelope
        beat_envelope = 0.5 + 0.5 * math.sin(2 * math.pi * 0.5 * t)  # 0.5 Hz pulse
        
        # Fade in/out
        fade_in = min(1.0, t / 3.0)  # 3 second fade in
        fade_out = max(0.0, 1.0 - max(0.0, t - 55) / 5.0)  # 5 second fade out
        
        # Combine all elements
        sample = (bass1 + bass2 + bass3) * beat_envelope * fade_in * fade_out * 0.25
        
        # Add slight reverb effect with delayed copy
        if i > 8820:  # 0.2 seconds delay
            sample += samples[i - 8820] * 0.2
        
        sample = max(-0.99, min(0.99, sample))
        samples.append(sample)
    
    write_wav(output_file, samples, sample_rate)
    print(f"✓ Generated lobby music (ambient): {output_file} (60s)")

def generate_game_audio_advanced(output_file, duration=60, sample_rate=44100):
    """
    Generate energetic game music with strategic tension
    Perfect for COUP gameplay with dramatic elements
    """
    frames = int(duration * sample_rate)
    samples = []
    
    for i in range(frames):
        t = i / sample_rate
        
        # Main melody frequencies (strategic, energetic)
        # Using chord progression: A minor, F major, C major
        frequencies = {
            0: 110,   # A2
            15: 110,  # A2
            30: 175,  # F3
            45: 131,  # C3
        }
        
        current_freq = 110
        for threshold, freq in frequencies.items():
            if t >= threshold:
                current_freq = freq
        
        # Main melody
        melody = math.sin(2 * math.pi * current_freq * t) * 0.2
        
        # Harmony (third above)
        harmony = math.sin(2 * math.pi * current_freq * 1.25 * t) * 0.15
        
        # Bass line
        bass_freq = current_freq / 2
        bass = math.sin(2 * math.pi * bass_freq * t) * 0.15
        
        # Rhythm pulse (heartbeat effect)
        beat = 0.3 if (t % 0.5) < 0.1 else 0.0
        
        # Dynamic envelope
        beat_pattern = 0.5 + 0.5 * math.sin(2 * math.pi * 2 * t)  # 2 Hz pulse = energetic
        
        # Fade in/out
        fade_in = min(1.0, t / 2.0)
        fade_out = max(0.0, 1.0 - max(0.0, t - 55) / 5.0)
        
        # Combine
        sample = (melody + harmony + bass) * beat_pattern * fade_in * fade_out * 0.28
        sample += beat * fade_in * fade_out * 0.15
        
        # Add reverb
        if i > 8820:
            sample += samples[i - 8820] * 0.15
        
        sample = max(-0.99, min(0.99, sample))
        samples.append(sample)
    
    write_wav(output_file, samples, sample_rate)
    print(f"✓ Generated game music (energetic): {output_file} (60s)")

def write_wav(filename, samples, sample_rate=44100):
    """Write audio samples to WAV file"""
    channels = 1
    bytes_per_sample = 2
    
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(bytes_per_sample)
        wav_file.setframerate(sample_rate)
        
        # Convert float samples to 16-bit PCM
        for sample in samples:
            sample = max(-1.0, min(1.0, sample))
            int_sample = int(sample * 32767)
            wav_file.writeframes(struct.pack('<h', int_sample))

if __name__ == '__main__':
    import os
    
    audio_dir = os.path.dirname(__file__) or '.'
    os.makedirs(audio_dir, exist_ok=True)
    
    print("🎵 Generating background music for COUP Game...")
    print()
    
    # Generate improved lobby music (ambient, mysterious)
    lobby_path = os.path.join(audio_dir, 'lobby.wav')
    generate_lobby_audio_advanced(lobby_path, duration=60)
    
    # Generate improved game music (energetic, dramatic)
    game_path = os.path.join(audio_dir, 'game.wav')
    generate_game_audio_advanced(game_path, duration=60)
    
    print()
    print("✅ Background music generated successfully!")
    print()
    print("📋 Audio Setup:")
    print(f"  🎼 Lobby:  Ambient, mysterious, calm (60s loop)")
    print(f"  ⚡ Game:   Energetic, strategic, dramatic (60s loop)")
    print()
    print("🎮 COUP Game Music Features:")
    print("  • Automatic transitions between lobby and game music")
    print("  • Volume control (🔊 Mute button, slider)")
    print("  • Browser autoplay support with user interaction fallback")
    print("  • High-quality synthesized background tracks")
