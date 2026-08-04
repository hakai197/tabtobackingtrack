# Tab to Backing Track

**Convert guitar, bass, and drum tablature into DAW-ready DI tracks and MIDI files for reamping with NAM and SSD.**

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)
![Built With](https://img.shields.io/badge/Built%20With-Electron%20%2B%20React%20%2B%20TypeScript-informational)

---

## What Is This?

Tab to Backing Track is a free, standalone desktop app for bedroom musicians. You bring your tabs or notation, and it hands you a ready-to-import export package for your DAW.

**Bring in:** Guitar Pro files, MIDI, MusicXML, ASCII tab (Ultimate Guitar style), or ChordPro charts.

**Get back:**

| File | What it is |
|---|---|
| `guitar_di.wav` | Raw DI audio — drop it on a track and hit it with NAM |
| `bass_di.wav` | Raw DI audio for NAM or any bass amp sim |
| `drum_track.mid` | MIDI groove — load it into SSD or any drum plugin |
| `session.txt` | BPM, key, time signature reference |

From there the workflow is yours. Drag the files into any DAW, pick your NAM captures and drum kit, and hit play. No proprietary project format, no lock-in — just standard files that work everywhere.

---

## Why This Exists

Most tools go in the wrong direction — they transcribe audio *into* tab. Tab to Backing Track goes the other way. It takes notation you already have and turns it into something you can actually play through an amp sim.

- **Guitar Pro** can export audio, but it's synthetic-sounding and isn't formatted for reamping.
- **Generic backing track generators** don't know your tab — they just invent something.
- **This app** reads your actual notes, generates timing-accurate DI audio and MIDI from them, and gets out of your way.

It was built specifically for the NAM + SSD reamping workflow: record or notate your part, export, reamp with profiled captures, done.

---

## Supported Input Formats

| Format | Extensions | Notes |
|---|---|---|
| Guitar Pro | `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.ptb` | Full track with tempo, time signature, and tuning |
| MIDI | `.mid`, `.midi` | Standard MIDI files (Type 0 and 1) |
| MusicXML | `.xml`, `.musicxml` | Exported from Sibelius, Finale, MuseScore, etc. |
| ASCII Tab | `.txt` | Ultimate Guitar style plain text |
| ChordPro | `.cho`, `.chordpro` | Chord/lyric chart format |

---

## What You Need

- **Windows 10 or later** (Mac and Linux support planned)
- **A DAW** — Reaper, FL Studio, Ableton Live, Logic Pro, Pro Tools, or any other
- **NAM plugin** (free) — [neuralampmodeler.com](https://www.neuralampmodeler.com)
- **NAM captures** (free community models) — [tone3000.com](https://tone3000.com)
- **A drum VST** — SSD5 Free is a great starting point ([Steven Slate Drums](https://stevenslatedrums.com/ssd5/#SSD5FREE))

---

## Installation

1. Go to the **[Releases](../../releases)** page on this repository.
2. Download the latest `Tab-to-Backing-Track-Setup.exe`.
3. Run the installer — no admin rights required.
4. Open the app from your desktop shortcut.

Everything is bundled. No Node.js, no Python, no extra installs needed.

---

## How To Use It

### 1 — Import your tab

Drag and drop your file anywhere onto the app window, or click the Input panel to browse. The app auto-detects the format and switches to the right parser.

### 2 — Review the analysis

The Analysis panel shows the detected **key**, **BPM**, and **time signature** pulled from your file.

### 3 — Adjust if needed

If the detected BPM or time signature isn't right, fix it before exporting:

- Use the **−** and **+** buttons to step BPM by 1, or type a value directly. Hold the button down to keep stepping continuously.
- Use the **numerator / denominator** dropdowns to change the time signature.

An **edited** badge appears next to any value you've changed from the detected default.

### 4 — Pick your groove and bass style

In the Export panel, choose a **drum groove** (Rock, Shuffle, Ballad, Pop) and a **bass style** (Root, Root-Fifth, Walking). These shape what the drum and bass MIDI files sound like.

### 5 — Export

Click **Export Backing Track** and choose a folder when prompted. The app writes four files:

```
guitar_di.wav
bass_di.wav
drum_track.mid
session.txt
```

### 6 — Load into your DAW

See the DAW setup guides below for step-by-step instructions.

---

## DAW Setup Guides

### Reaper

1. Drag `guitar_di.wav` and `bass_di.wav` into the project — Reaper creates new audio tracks automatically.
2. On each audio track, open the FX chain and add **NAM** as an insert. Load your capture.
3. Drag `drum_track.mid` into the project. Reaper creates a MIDI item — assign SSD as the instrument on that track.
4. Set the project BPM to match the value in `session.txt`.

### FL Studio

1. In the **Playlist**, drag `guitar_di.wav` and `bass_di.wav` onto audio tracks. Add NAM as an effect in the mixer channel each track routes to.
2. Open the **Channel Rack**, load SSD as an instrument, and import `drum_track.mid` by dragging it onto the SSD pattern in the playlist.
3. Set the song BPM in the toolbar to the value from `session.txt`.

### Ableton Live

1. Drag `guitar_di.wav` and `bass_di.wav` into **Audio tracks** in Arrangement or Session view. Insert NAM as an audio effect on each track.
2. Drag `drum_track.mid` onto a **MIDI track** that has SSD loaded as an instrument.
3. Set the project tempo to the value from `session.txt`.

---

## Building From Source

### Prerequisites

- **Node.js** v18 or higher (tested on v25)
- **npm** v9 or higher
- **Windows 10 or later**

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/tab-to-backing-track.git

# 2. Enter the project directory
cd tab-to-backing-track

# 3. Install dependencies
npm install

# 4. Run in development mode (hot reload)
npm run dev

# 5. Build the Windows installer
npm run build:win
```

The installer is written to `dist/` as a `.exe`.

### Other useful commands

```bash
npm run typecheck   # TypeScript type check (main process + renderer)
npm run lint        # ESLint
npm run format      # Prettier — run this before committing
```

---

## Project Structure

```
tab-to-backing-track/
├── src/
│   ├── main/                   Electron main process
│   │   └── index.ts            File system writes, folder picker dialog, IPC handlers
│   ├── preload/                IPC bridge
│   │   ├── index.ts            contextBridge — exposes window.api to the renderer
│   │   └── index.d.ts          TypeScript types for the IPC surface
│   └── renderer/
│       └── src/
│           ├── App.tsx         Root component — state, layout, export orchestration
│           ├── components/     Drop zone and input UI components
│           │   ├── GuitarProDropzone.tsx
│           │   ├── MidiDropzone.tsx
│           │   ├── MusicXmlDropzone.tsx
│           │   └── TabInput.tsx
│           ├── utils/          Parsers, generators, and music theory helpers
│           │   ├── guitarProParser.ts    Guitar Pro → AnalysisResult (via alphatab)
│           │   ├── midiParser.ts         MIDI → AnalysisResult (via @tonejs/midi)
│           │   ├── musicXmlParser.ts     MusicXML → AnalysisResult (via DOMParser)
│           │   ├── tabParser.ts          ASCII tab → AnalysisResult
│           │   ├── keyDetection.ts       Krumhansl-Schmuckler key detection
│           │   ├── diWavGenerator.ts     Notes → sawtooth DI WAV (OfflineAudioContext)
│           │   ├── drumMidiGenerator.ts  BPM + groove style → drum MIDI
│           │   └── bassMidiGenerator.ts  Notes + bass style → bass MIDI
│           └── types/
│               └── index.ts              Note, AnalysisResult, TimeSig shared types
├── package.json
└── electron-builder.yml        Installer configuration
```

### Key design decisions

- **All parsing and audio/MIDI generation runs in the renderer process.** The main process only handles dialogs and file writes. This keeps the IPC surface minimal and testable.
- **Notes are stored in seconds** (not ticks or beats). When the user changes BPM, note times are scaled by `detectedBPM / userBPM` before export — pitches and velocities are never touched.
- **No audio samples at runtime.** WAV output is synthesised directly from MIDI pitch values using `OfflineAudioContext`. There is nothing to install or download separately.
- **MIDI files are encoded inline** without an encoding library, using standard variable-length delta times, tempo meta-events (`0xFF 0x51`), and time signature meta-events (`0xFF 0x58`).

---

## Contributing

Contributions are welcome. Please open an issue first if you're planning something significant, so we can agree on the approach before you invest time in it.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature

# Make your changes, then:
npm run lint        # must pass
npm run typecheck   # must pass

git commit -m 'Add your feature'
# Push your branch and open a Pull Request
```

Please keep PRs focused — one feature or fix per PR makes review much faster.

---

## Roadmap

- [ ] macOS support
- [ ] Linux support
- [ ] ChordPro format support (parser in progress)
- [ ] Additional groove library genres (jazz, metal, country)
- [ ] Swing and humanisation controls for drum MIDI output
- [ ] In-app NAM capture browser
- [ ] Multi-track Guitar Pro export (separate files per track)

---

## Legal

This software is released under the **MIT License** — see the [LICENSE](LICENSE) file for full terms.

Users are responsible for ensuring they have the right to use any tablature or notation they import. Tab to Backing Track does not condone the unauthorized downloading or reproduction of copyrighted material.

---

## Acknowledgements

- **[Neural Amp Modeler](https://github.com/sdatkinson/neural-amp-modeler)** by Steven Atkinson — the open source amp profiling project this workflow is built around
- **[Tone3000](https://tone3000.com)** — community hub for NAM captures
- **[alphatab](https://alphatab.net)** — Guitar Pro file parsing library
- **[@tonejs/midi](https://github.com/Tonejs/Midi)** — MIDI file parsing
- The open source music technology community
