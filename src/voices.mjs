// Voice casting: named Edge TTS presets so a character's voice is a
// casting choice, not a memorised voice id. `voice --list` shows the
// roster; `voice --preset neerja` casts the pack (manifest.voice gains
// { engine, id, preset }). Presets are ordinary Edge voice ids — custom
// ids still work via init --voice or by editing the manifest.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadManifest } from './manifest.mjs';

export const VOICE_PRESETS = {
  neerja: { id: 'en-IN-NeerjaExpressiveNeural', label: 'Neerja — Indian English, female, expressive (the Doodle Swapnil voice)' },
  neerjaCalm: { id: 'en-IN-NeerjaNeural', label: 'Neerja (calm) — Indian English, female' },
  aashi: { id: 'en-IN-AashiNeural', label: 'Aashi — Indian English, female, bright' },
  prabhat: { id: 'en-IN-PrabhatNeural', label: 'Prabhat — Indian English, male' },
  ava: { id: 'en-US-AvaMultilingualNeural', label: 'Ava — US English, female, multilingual' },
  andrew: { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew — US English, male, multilingual' },
  sonia: { id: 'en-GB-SoniaNeural', label: 'Sonia — British English, female' },
  ryan: { id: 'en-GB-RyanNeural', label: 'Ryan — British English, male' },
};

export function listPresets() {
  return Object.entries(VOICE_PRESETS).map(([name, p]) => `${name} = ${p.id} — ${p.label}`);
}

export function setVoicePreset(packDir, preset) {
  const p = VOICE_PRESETS[preset];
  if (!p) throw new Error(`unknown preset "${preset}" — roster: ${Object.keys(VOICE_PRESETS).join(', ')}`);
  const m = loadManifest(packDir);
  m.voice = { engine: 'edge-tts', id: p.id, preset };
  writeFileSync(join(packDir, 'character.rigpop.json'), JSON.stringify(m, null, 2) + '\n');
  return m.voice;
}
