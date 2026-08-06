# Tab to Backing Track

**Convert guitar, bass, and drum tablature into DAW-ready DI tracks and MIDI files for reamping with NAM and SSD.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)](#installation)
[![Built With](https://img.shields.io/badge/Built%20With-Electron%20%2B%20React%20%2B%20TypeScript-informational)](#building-from-source)
[![Releases](https://img.shields.io/github/v/release/hakai197/tabtobackingtrack)](https://github.com/hakai197/tabtobackingtrack/releases)
![Build](https://github.com/hakai197/tabtobackingtrack/actions/workflows/build.yml/badge.svg)

---

## What Is This?

Tab to Backing Track is a free, standalone desktop app for bedroom musicians. Load your guitar, bass, and drum tabs and it hands you a ready-to-import export package for your DAW — one file per instrument, at your tempo.

**Bring in:** Guitar Pro files, MIDI, MusicXML, ASCII tab (Ultimate Guitar style), or ChordPro charts — for each instrument independently.

**Get back:**

| File             | What it is                                                       |
| ---------------- | ---------------------------------------------------------------- |
| `guitar_di.wav`  | Raw DI audio — drop it on a track and hit it with NAM            |
| `bass_di.wav`    | Bass DI audio or bass MIDI groove, depending on format selection |
| `drum_track.wav` | Drum synthesis WAV or MIDI groove, depending on format selection |
| `session.txt`    | BPM, key, time signature reference                               |

From there the workflow is yours. Drag the files into any DAW, pick your NAM captures and drum kit, and hit play. No proprietary project format, no lock-in — just standard files that work everywhere.

---

## Why This Exists

Most tools go in the wrong direction — they transcribe audio _into_ tab. Tab to Backing Track goes the other way. It takes notation you already have and turns it into something you can actually play through an amp sim.

- **Guitar Pro** can export audio, but it's synthetic-sounding and isn't formatted for reamping.
- **Generic backing track generators** don't know your tab — they just invent something.
- **This app** reads your actual notes, generates timing-accurate DI audio and MIDI from them, and gets out of your way.

It was built specifically for the NAM + SSD reamping workflow: record or notate your part, export, reamp with profiled captures, done.

---

## Supported Input Formats

| Format     | Extensions                                    | Notes                                             |
| ---------- | --------------------------------------------- | ------------------------------------------------- |
| Guitar Pro | `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.ptb` | Full track with tempo, time signature, and tuning |
| MIDI       | `.mid`, `.midi`                               | Standard MIDI files (Type 0 and 1)                |
| MusicXML   | `.xml`, `.musicxml`                           | Exported from Sibelius, Finale, MuseScore, etc.   |
| ASCII Tab  | `.txt`                                        | Ultimate Guitar style plain text                  |
| ChordPro   | `.cho`, `.chordpro`                           | Chord/lyric chart format                          |

---

## What You Need

- **Windows 10 or later** (Mac and Linux support planned)
- **A DAW** — Reaper, FL Studio, Ableton Live, or any other
- **NAM plugin** (free) for guitar/bass DI tracks — [neuralampmodeler.com](https://www.neuralampmodeler.com)
- **NAM captures** (free community models) — [tone3000.com](https://tone3000.com)
- **A drum VST** (optional) — needed only if exporting drum MIDI. SSD5 Free is a great starting point ([Steven Slate Drums](https://stevenslatedrums.com/ssd5/#SSD5FREE))

---

## Installation

1. Go to the **[Releases](https://github.com/hakai197/tabtobackingtrack/releases)** page.
2. Download the latest `Tab-to-Backing-Track-win32-x64.zip`.
3. Extract the zip to a folder of your choice.
4. Open `Tab to Backing Track.exe` inside the extracted folder.

Everything is bundled. No Node.js, no Python, no installer required. The app will notify you automatically when a new version is available.

> For a detailed first-use walkthrough, DAW integration steps, and Enhanced Audio mode setup, see **[SETUP.md](SETUP.md)**.

---

## How To Use It

### 1 — Load your instrument tabs

The Input panel has three independent slots: **Guitar**, **Bass**, and **Drums**. Drop a file onto any slot or click **Browse** to open a file picker. You can also drop a file anywhere on the app window — the app auto-detects the instrument from the filename or Guitar Pro track metadata, and shows a dialog to confirm if it can't tell.

Load as many or as few slots as you need. You can export one instrument, two, or all three.

### 2 — Review the analysis

The Analysis panel shows the detected **key**, **BPM**, and **time signature** from the loaded files. If multiple slots are loaded, use the tab strip at the top of the panel to switch between instrument views.

### 3 — Adjust if needed

BPM and time signature are global — they apply to all instruments at once:

- Use the **−** and **+** buttons to step BPM by 1, or type a value directly. Hold the button to keep stepping.
- Use the **numerator / denominator** dropdowns to change the time signature.

An **edited** badge appears next to any value you've changed from the detected default. When the user-set BPM differs from the source file, notes are scaled in time to match — pitches and velocities are never touched.

### 4 — Pick your export format and style

In the Export panel:

- **Format**: **WAV (DI)** generates synthesized audio files ready for reamping. **MIDI** generates MIDI files for loading into drum and bass plugins. Guitar is always WAV.
- **Groove**: choose a drum pattern — Rock, Shuffle, Ballad, or Pop.
- **Bass style**: choose Root, Root-Fifth, or Walking bass line generation.

### 5 — Choose audio quality

- **Standard (Built-in)** — synthesized audio, works out of the box, no setup required.
- **Enhanced (FluidSynth + SoundFont)** — real instrument samples via FluidSynth. Click **View Setup Guide** in the Export panel for one-time setup instructions.

See [Enhanced Audio Mode](#enhanced-audio-mode) below for details.

### 6 — Export

Check the boxes next to the instruments you want to include, then click **Export**. Choose a destination folder — the app writes one file per checked instrument plus `session.txt`.

### 7 — Load into your DAW

See the DAW setup guides below.

---

## Finding and Importing Tabs

Tab to Backing Track supports multiple input formats. Here is where to find files for each format and how to load them into the app.

---

#### Guitar Pro Files (.gp, .gp3, .gp4, .gp5, .gpx)

Guitar Pro files are the best input format — they contain all instrument tracks (guitar, bass, drums) in a single file with accurate timing and notation.

**Free sources:**

| Site | URL | Notes |
|---|---|---|
| GProTab | gprotab.net | Free GP file sharing, no account needed |
| GTPTabs | gtptabs.com | Free Guitar Pro archive |
| Ultimate Guitar | ultimate-guitar.com | Requires Pro subscription to download |
| Guitar Pro Blog | guitar-pro.com/blog | Free drum pattern packs |

**How to download from GProTab.net:**
1. Go to gprotab.net
2. Search for the song or artist you want
3. Click the tab title to open it
4. Click the Download button
5. Save the .gp5 or .gpx file to your computer

**How to load into the app:**
- Drag and drop the file anywhere onto the app window
- The app automatically detects all tracks in the file
- Guitar, bass, and drum tracks are routed to their correct instrument slots automatically
- Track names from the file are used for export filenames (e.g. James_di.wav, Lars_drum.wav)

**Tip:** If a GP5 file contains multiple guitar tracks (rhythm + lead) the app exports a separate DI file for each track so you can mix them independently in your DAW.

---

#### MIDI Files (.mid, .midi)

MIDI files work well for single instrument tracks.

**Free sources:**

| Site | URL | Notes |
|---|---|---|
| LANDR | blog.landr.com/free-midi-packs | Free drum and bass MIDI packs |
| FreeMidi | freemidi.org | Large MIDI archive |
| Bitmidi | bitmidi.com | Free MIDI library |

**How to load into the app:**
- Drag the .mid file onto the specific instrument slot you want to load it into (Guitar, Bass or Drums)
- Or drag onto the app window — the app will ask which instrument slot to use if it cannot detect the instrument automatically

---

#### MusicXML Files (.xml, .musicxml)

MusicXML is exported from notation software like Sibelius, Finale, and MuseScore.

**Free sources:**

| Site | URL | Notes |
|---|---|---|
| GProTab | gprotab.net | Export any GP tab as MusicXML |
| MuseScore Desktop | musescore.org | Free desktop app, export any score |
| OpenScore | openscore.co.uk | Free licensed classical scores |

**How to export MusicXML from GProTab.net:**
1. Open any tab on gprotab.net
2. Click the Export button
3. Select MusicXML as the format
4. Save the .musicxml file
5. Drag it into the app

**How to load into the app:**
- Drag the .xml or .musicxml file onto an instrument slot
- Or drag onto the app window and select the instrument when prompted

---

#### Plain Text Tabs (ASCII Tab)

ASCII tabs are the most common format found on the internet — the kind you copy and paste from tab sites.

**Sources:**
- Ultimate Guitar — ultimate-guitar.com (free tabs, no subscription needed)
- BigBassTabs — bigbasstabs.com (50,000+ bass tabs)
- TabClub — tabclub.net (120,000+ tabs)

**Supported text tab formats:**
- Standard ASCII guitar tab (e|B|G|D|A|E| format)
- Bass tab (G|D|A|E| format)
- Drum tab (K|S|HH| format)
- ChordPro ([Am] [G] [C] chord markers)
- Chord-only charts (Am - G - C - F)
- Custom tunings (any string label format)

**How to load into the app:**
1. Copy the tab text from any website
2. Click the instrument slot you want to load
3. Paste the tab text into the text area
4. Click Parse Tab or click outside the text area
5. The app auto-detects the format and tuning

---

#### Multi-Format Workflow Example

Complete backing track using Enter Sandman:

1. Go to gprotab.net and search "Enter Sandman Metallica"
2. Download the GP5 file
3. Drag it onto the app window
4. The app detects all 4 tracks automatically:
   - James (rhythm guitar) → Guitar slot
   - Kirk (lead guitar) → Guitar slot
   - Kliff (bass) → Bass slot
   - Lars (drums) → Drums slot
5. Adjust BPM in the Analysis panel if needed
6. Click Export Backing Track
7. Drag the exported files into your DAW:
   - James_di.wav → audio track → NAM
   - Kirk_di.wav → audio track → NAM
   - Kliff_di.wav → audio track → NAM or bass amp sim
   - Lars_drum.wav → audio track (or Lars_drum.mid → MIDI track → SSD)

---

#### Troubleshooting Tab Loading

**GP5 file shows wrong BPM:**
Use the BPM control in the Analysis panel to correct it. Hold + or - to step through values.

**Only one instrument slot loaded from a GP5:**
Some GP5 files only contain one instrument track. This is correct — load separate files for the other instruments if needed.

**ASCII tab not parsing correctly:**
Make sure you copied the full tab including the string labels at the start of each line (e|--0--2-- etc.).

**Drum tab not loading into Drums slot:**
When pasting a drum tab make sure you are pasting into the Drums instrument card specifically.

---

## Enhanced Audio Mode

By default, Tab to Backing Track generates audio using built-in synthesis (Standard mode). You can switch to **Enhanced mode** to render through FluidSynth with a real SoundFont — this produces General MIDI instrument samples instead of synthesized waveforms.

Enhanced mode requires a one-time setup.

### Step 1 — Install FluidSynth

Download FluidSynth from [fluidsynth.org](https://www.fluidsynth.org) and place the executable at:

```
resources/fluidsynth/win/fluidsynth.exe
```

(relative to the app root when running from source, or the `resources/` folder inside the installed app directory when packaged).

### Step 2 — Download a SoundFont

Download **GeneralUser GS** (free, CC license) and place the `.sf2` file at:

```
%APPDATA%\tab-to-backing-track\soundfonts\GeneralUser-GS.sf2
```

GeneralUser GS is available at [schristiancollins.com/generaluser.php](http://schristiancollins.com/generaluser.php).

### Step 3 — Enable Enhanced mode

In the Export panel, find the **Audio Quality** section and select **Enhanced (FluidSynth + SoundFont)**. Click **View Setup Guide → Check FluidSynth Status** to verify both files are detected before exporting.

### GM instrument mapping

| Track  | GM Program | Sound                   |
| ------ | ---------- | ----------------------- |
| Guitar | 27         | Electric Guitar (Clean) |
| Bass   | 33         | Electric Bass (Finger)  |
| Drums  | Channel 10 | GM percussion           |

> **Note:** Enhanced mode never silently falls back to Standard. If FluidSynth or the SoundFont file is missing, the export is blocked and an error is shown. Fix the setup and retry.

### Instrument Presets

When Enhanced Audio Mode is active, three preset selectors appear in the Export panel:

**Guitar Preset**
Choose from 8 guitar sounds including clean electric, jazz, overdriven, distortion, and acoustic variants.
For NAM reamping, keep this set to "Electric Guitar (clean)" for the best input signal.

**Bass Preset**
Choose from 8 bass sounds including finger, pick, fretless, slap, and synth bass variants.
"Electric Bass (finger)" works well for most styles.

**Drum Kit**
Choose from 8 GM drum kits:

| Kit            | Best For               |
| -------------- | ---------------------- |
| Standard Kit   | Rock, pop, general use |
| Power Kit      | Heavy rock, metal      |
| Room Kit       | Smaller room ambience  |
| Jazz Kit       | Jazz, swing            |
| Brush Kit      | Soft jazz, acoustic    |
| Electronic Kit | Synth, electronic      |
| TR-808 Kit     | Hip-hop, trap          |
| Orchestra Kit  | Classical, cinematic   |

Preset selections are remembered for the session but reset to defaults on next launch.

---

## DAW Setup Guides

### Reaper

1. Drag `guitar_di.wav` and `bass_di.wav` into the project — Reaper creates new audio tracks automatically.
2. On each audio track, open the FX chain and add **NAM** as an insert. Load your capture.
3. If exporting drum MIDI: drag `drum_track.mid` into the project and assign SSD as the instrument on that track.
4. Set the project BPM to match the value in `session.txt`.

### FL Studio

1. In the **Playlist**, drag `guitar_di.wav` and `bass_di.wav` onto audio tracks. Add NAM as an effect in the mixer channel each track routes to.
2. If exporting drum MIDI: open the **Channel Rack**, load SSD as an instrument, and import `drum_track.mid` onto the SSD pattern in the playlist.
3. Set the song BPM in the toolbar to the value from `session.txt`.

### Ableton Live

1. Drag `guitar_di.wav` and `bass_di.wav` into **Audio tracks** in Arrangement or Session view. Insert NAM as an audio effect on each track.
2. If exporting drum MIDI: drag `drum_track.mid` onto a **MIDI track** that has SSD loaded as an instrument.
3. Set the project tempo to the value from `session.txt`.

---

## Building From Source

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- **Windows 10 or later**

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/hakai197/tabtobackingtrack.git

# 2. Enter the project directory
cd tabtobackingtrack

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
│   ├── main/                        Electron main process
│   │   ├── index.ts                 IPC handlers, auto-updater, application menu
│   │   ├── fluidsynth.ts            FluidSynth path resolution and WAV rendering
│   │   └── midiWriter.ts            Temp MIDI file generation for FluidSynth input
│   ├── preload/                     IPC bridge
│   │   ├── index.ts                 contextBridge — exposes window.api to the renderer
│   │   └── index.d.ts               TypeScript types for the entire IPC surface
│   └── renderer/
│       └── src/
│           ├── App.tsx              Root component — state, layout, export orchestration
│           ├── components/
│           │   ├── InstrumentCard.tsx          Per-instrument drop zone and file loading
│           │   ├── InstrumentTabs.tsx          Analysis tab strip (shown when 2+ slots loaded)
│           │   ├── ExportPanel.tsx             Format, style, and audio quality controls
│           │   ├── InstrumentSelectDialog.tsx  Modal for ambiguous global file drops
│           │   ├── AudioQualityPanel.tsx       Standard/Enhanced toggle + FluidSynth setup guide
│           │   └── UpdateNotification.tsx      In-app update banner (available → downloading → ready)
│           ├── utils/
│           │   ├── guitarProParser.ts          Guitar Pro → AnalysisResult (via alphatab)
│           │   ├── midiParser.ts               MIDI → AnalysisResult (via @tonejs/midi)
│           │   ├── musicXmlParser.ts           MusicXML → AnalysisResult (via DOMParser)
│           │   ├── tabParser.ts                ASCII tab / ChordPro → AnalysisResult
│           │   ├── keyDetection.ts             Krumhansl-Schmuckler key detection
│           │   ├── instrumentDetector.ts       Filename + GP track heuristic → InstrumentKey
│           │   ├── diWavGenerator.ts           Guitar notes → DI WAV (OfflineAudioContext)
│           │   ├── bassDiGenerator.ts          Bass notes → DI WAV
│           │   ├── drumDiGenerator.ts          Groove pattern → drum WAV
│           │   ├── drumMidiGenerator.ts        Groove pattern → drum MIDI (@tonejs/midi)
│           │   ├── bassMidiGenerator.ts        Bass chord extraction → bass MIDI
│           │   ├── drumPatternToNotes.ts       Groove pattern → Note[] (Enhanced mode input)
│           │   └── bassNoteExtractor.ts        Chord extraction → bass Note[] (Enhanced mode input)
│           └── types/
│               └── index.ts                   Note, AnalysisResult, TimeSig, InstrumentSlot types
└── package.json
```

### Key design decisions

- **Three independent instrument slots.** Guitar, Bass, and Drums each load, parse, and export independently. Loading one slot does not affect the others.
- **Parsing runs in the renderer process.** The main process only handles dialogs, file writes, and FluidSynth execution. This keeps the IPC surface minimal.
- **Notes are stored in seconds** (not ticks or beats). When the user changes BPM, note times are scaled by `detectedBPM / userBPM` before export — pitches and velocities are never touched.
- **Standard mode needs no external dependencies.** WAV output is synthesised directly from note data using `OfflineAudioContext`. MIDI output uses `@tonejs/midi`. Nothing to install or download separately.
- **Enhanced mode is strictly opt-in.** FluidSynth rendering only runs when explicitly selected _and_ FluidSynth is verified present. The app never silently falls back between modes.
- **Auto-update is passive.** On launch the app checks GitHub Releases for a newer version. If one is available, a banner appears — the user chooses when to download and install.

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
- [ ] Additional groove library genres (jazz, metal, country)
- [ ] Swing and humanisation controls for drum output
- [ ] In-app SoundFont browser for Enhanced mode
- [ ] In-app NAM capture browser

---

## Legal

This software is released under the **MIT License** — see the [LICENSE](LICENSE) file for full terms.

Users are responsible for ensuring they have the right to use any tablature or notation they import. Tab to Backing Track does not condone the unauthorized downloading or reproduction of copyrighted material.

---

## Acknowledgements

- **[Neural Amp Modeler](https://github.com/sdatkinson/neural-amp-modeler)** by Steven Atkinson — the open source amp profiling project this workflow is built around
- **[Tone3000](https://tone3000.com)** — community hub for NAM captures
- **[alphatab](https://alphatab.net)** — Guitar Pro file parsing library
- **[@tonejs/midi](https://github.com/Tonejs/Midi)** — MIDI file reading and writing
- **[FluidSynth](https://www.fluidsynth.org)** — audio synthesis engine used in Enhanced mode
- **[electron-updater](https://www.electron.build/auto-update)** — automatic update delivery
- **[electron-log](https://github.com/megahertz/electron-log)** — main process logging
- The open source music technology community
