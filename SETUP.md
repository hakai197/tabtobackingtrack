# Tab to Backing Track — Setup Guide

This guide takes you from a fresh install to your first completed backing track export. It also covers DAW integration and the optional Enhanced Audio mode for anyone who wants real instrument samples instead of synthesized audio.

---

## Table of Contents

1. [What You Need](#1-what-you-need)
2. [Installing the App](#2-installing-the-app)
3. [Your First Export — Step by Step](#3-your-first-export--step-by-step)
4. [DAW Integration](#4-daw-integration)
   - [Reaper](#reaper)
   - [FL Studio](#fl-studio)
   - [Ableton Live](#ableton-live)
5. [Enhanced Audio Mode Setup](#5-enhanced-audio-mode-setup)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. What You Need

### Required

| What | Where to get it |
|---|---|
| **Tab to Backing Track** | [Releases page](https://github.com/hakai197/tabtobackingtrack/releases) |
| **A DAW** | Reaper, FL Studio, Ableton, or any other |
| **NAM plugin** (for reamping guitar and bass) | [neuralampmodeler.com](https://www.neuralampmodeler.com) |
| **NAM captures** (amp profiles) | [tone3000.com](https://tone3000.com) |

### Optional

| What | Why you'd need it |
|---|---|
| **A drum VST** (e.g. SSD5 Free) | Only needed if exporting drums as MIDI rather than WAV |
| **FluidSynth + a SoundFont** | Only needed for Enhanced Audio mode — see [Section 5](#5-enhanced-audio-mode-setup) |

### Your tab files

The app accepts these formats for each instrument slot:

| Format | File extensions |
|---|---|
| Guitar Pro | `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.ptb` |
| MIDI | `.mid`, `.midi` |
| MusicXML | `.xml`, `.musicxml` |
| ASCII tab | `.txt` |
| ChordPro | `.cho`, `.chordpro` |

You don't need all three instruments. Load just the ones you have — the rest stay empty and are skipped on export.

---

## 2. Installing the App

1. Go to the [Releases](https://github.com/hakai197/tabtobackingtrack/releases) page on GitHub.
2. Under the latest release, download **`Tab-to-Backing-Track-Setup.exe`**.
3. Run the installer. When Windows shows a SmartScreen warning ("Windows protected your PC"), click **More info → Run anyway**. This appears because the app is not code-signed yet.
4. The installer creates a desktop shortcut. No admin rights are required.
5. Open the app. That's it — nothing else to install for Standard mode.

> **Updates:** The app checks for new versions automatically on each launch. When an update is available, a banner appears at the top of the window. Click **Download Update**, wait for the download, then **Restart Now** to apply it.

---

## 3. Your First Export — Step by Step

This walkthrough uses a Guitar Pro file for guitar. Adapt for whatever format you have.

### Step 1 — Load your guitar tab

In the **Input** panel you'll see three slots: Guitar, Bass, and Drums.

**Option A — Drag and drop:**
Drag your `.gp5` (or other format) file anywhere onto the app window. If the filename contains "guitar" or similar, the app routes it straight to the Guitar slot. If it's ambiguous, a dialog asks you to choose.

**Option B — Browse:**
Click the **Browse** button inside the Guitar card and pick your file.

Once loaded, the Guitar card shows a checkmark and the filename. The Guitar export checkbox in the Export panel is checked automatically.

### Step 2 — Load bass and drums (optional)

Do the same for Bass and Drums if you have files. You can also load the same Guitar Pro file into multiple slots — for example, if the same `.gp5` file has separate guitar and bass tracks, load it into both slots.

If you skip a slot, that instrument is simply not exported.

### Step 3 — Check the Analysis panel

The **Analysis** panel on the right shows:
- **Key** — detected from the notes (e.g. "A minor")
- **BPM** — tempo from the file
- **Time Signature** — e.g. 4/4
- **Notes Detected** — how many note events were parsed

If multiple slots are loaded, a tab strip appears above the analysis data — click **Guitar**, **Bass**, or **Drums** to switch between them.

### Step 4 — Adjust BPM if needed

If the detected BPM is wrong (common with ASCII tab files which have no tempo), adjust it:
- Click **−** or **+** to step by 1 BPM. Hold the button to scroll quickly.
- Or type a number directly in the BPM field.

The **edited** badge appears when you've changed the value from what was detected. All instruments share the same BPM — changing it scales note timings across all slots automatically.

### Step 5 — Choose your export format

In the **Export** panel:

**Format (bass and drums only):**
- **WAV (DI)** — generates synthesized audio files. Use this if you plan to reamp bass through NAM, or want a drum WAV to place directly in your DAW without a drum plugin.
- **MIDI** — generates MIDI files. Use this to drive a drum VST (like SSD) or a bass plugin.

Guitar is always exported as WAV — it's a raw DI signal by definition.

**Groove** (affects drum output):
- Rock, Shuffle, Ballad, Pop — choose the pattern that fits the song.

**Bass style** (affects bass output):
- **Root** — plays the root note of each chord, sustained. Clean and simple.
- **Root-Fifth** — alternates root and fifth. More movement.
- **Walking** — chromatic approach lines between chords. Jazz or more complex feel.

### Step 6 — Export

Click the **Export** button (it shows the instrument names you've checked, e.g. "Export Guitar + Bass"). A folder picker opens — choose where to save the files.

The app writes:

| File | What it is |
|---|---|
| `guitar_di.wav` | Guitar DI — ready for NAM reamping |
| `bass_di.wav` | Bass DI or `bass_track.mid` depending on format |
| `drum_track.wav` | Drum synthesis or `drum_track.mid` depending on format |
| `session.txt` | BPM, key, time signature, and file list reference |

That's the export done. Now take those files into your DAW — see [Section 4](#4-daw-integration).

---

## 4. DAW Integration

In all cases: set your DAW project tempo to match the BPM in `session.txt` before you start.

---

### Reaper

**Guitar and bass (DI WAV):**

1. Drag `guitar_di.wav` and `bass_di.wav` into the Reaper arrange window. Reaper creates a new audio track for each.
2. Click the track name to open the **FX chain**.
3. Add **ReaInsert** (or just add NAM directly as a VST). Add NAM, then click **Load model** inside the NAM plugin and select your amp capture.
4. Adjust the output gain to taste.

**Drums (WAV):**

1. Drag `drum_track.wav` into the arrange window as an audio track.
2. You can run it dry — the WAV already has the drum synthesis baked in.

**Drums (MIDI):**

1. Drag `drum_track.mid` into the arrange window. Reaper creates a MIDI item.
2. On the same track, open the FX chain and add your drum plugin (e.g. SSD5).
3. Make sure the MIDI routing goes into the drum plugin. In Reaper this is usually automatic.

**Set tempo:**

Open **Project Settings** (Alt+Enter) → **Project BPM** and set it to the value in `session.txt`. Or just type it in the toolbar at the top.

---

### FL Studio

**Guitar and bass (DI WAV):**

1. In the **Mixer**, create two channels — one for guitar, one for bass.
2. In the **Playlist**, drag `guitar_di.wav` onto an audio track that routes to the guitar mixer channel.
3. In the guitar mixer channel, click an FX slot and load **NAM**. Select your amp capture inside NAM.
4. Repeat for `bass_di.wav` on the bass mixer channel.

**Drums (WAV):**

1. Drag `drum_track.wav` into the Playlist as an audio clip.
2. No plugin needed — the audio plays straight through.

**Drums (MIDI):**

1. In the **Channel Rack**, load SSD5 (or your drum plugin) as an instrument channel.
2. In the Playlist, create a new pattern and drag `drum_track.mid` onto it — FL Studio imports the MIDI into the pattern.
3. Assign the pattern to the SSD5 channel.

**Set tempo:**

Click the BPM display in the toolbar (top of the screen) and type the value from `session.txt`.

---

### Ableton Live

**Guitar and bass (DI WAV):**

1. In **Arrangement view** (or Session view), create two Audio tracks.
2. Drag `guitar_di.wav` onto one track and `bass_di.wav` onto the other.
3. On each track, open the **Audio Effects** chain and add NAM as an Audio Effect. Load your capture inside NAM.

**Drums (WAV):**

1. Create an Audio track and drag `drum_track.wav` onto it.

**Drums (MIDI):**

1. Create a MIDI track and load your drum plugin (SSD5 or similar) as the instrument.
2. Drag `drum_track.mid` into the clip slot on that track. Ableton imports it as a MIDI clip.

**Set tempo:**

Click the tempo field in the top toolbar and type the value from `session.txt`.

---

## 5. Enhanced Audio Mode Setup

Enhanced mode renders your instruments through **FluidSynth** using a **SoundFont** — a file containing real instrument samples. This produces a more natural-sounding result than the built-in synthesis, especially for bass and drum fills.

Enhanced mode is optional. Standard mode works without any of this.

---

### Step 1 — Download FluidSynth

FluidSynth is a free, open-source software synthesizer.

1. Go to [fluidsynth.org](https://www.fluidsynth.org) and follow the link to the GitHub releases page.
2. Under the latest release, find the **Windows** download — look for a `.zip` or `.exe` with "win64" in the filename.
3. Extract the archive. Inside you'll find `fluidsynth.exe` (usually inside a `bin/` folder).
4. Copy `fluidsynth.exe` to this path inside the **Tab to Backing Track** installation folder:

```
resources\fluidsynth\win\fluidsynth.exe
```

To find the installation folder: right-click the desktop shortcut → **Open file location**. The `resources\` folder is one level up from the `app.asar` file you'll see there.

**If running from source:**

Place the file at:
```
<project-root>\resources\fluidsynth\win\fluidsynth.exe
```

---

### Step 2 — Download a SoundFont

A SoundFont (`.sf2`) contains the actual instrument samples FluidSynth plays back.

**Recommended: GeneralUser GS** — free, CC license, good quality.

1. Go to [schristiancollins.com/generaluser.php](http://schristiancollins.com/generaluser.php).
2. Download the `.sf2` file (not the SFZ version).
3. Rename the file to exactly `GeneralUser-GS.sf2` if it isn't already.
4. Create the following folder if it doesn't exist, then place the file there:

```
%APPDATA%\tab-to-backing-track\soundfonts\GeneralUser-GS.sf2
```

To open `%APPDATA%`: press **Win + R**, type `%APPDATA%`, and press Enter. Then navigate into (or create) `tab-to-backing-track\soundfonts\`.

---

### Step 3 — Verify the setup inside the app

1. Open Tab to Backing Track.
2. In the **Export** panel, find the **Audio Quality** section.
3. Select **Enhanced (FluidSynth + SoundFont)**.
4. Click **View Setup Guide** to open the setup panel.
5. Click **Check FluidSynth Status**.

The status display will show one of two outcomes:

| Result | Meaning |
|---|---|
| ✓ FluidSynth binary | `fluidsynth.exe` was found at the expected path |
| ✓ SoundFont file | `GeneralUser-GS.sf2` was found in `%APPDATA%` |
| ✗ FluidSynth binary | File not found — recheck the path in Step 1 |
| ✗ SoundFont file | File not found — recheck the filename and folder in Step 2 |

When both show a checkmark, Enhanced mode is ready. Your next export will use FluidSynth.

---

### What Enhanced mode does differently

| Instrument | Standard mode | Enhanced mode |
|---|---|---|
| Guitar | Sawtooth DI synthesis (OfflineAudioContext) | GM program 27 — Electric Guitar (Clean) |
| Bass | Simulated bass waveform | GM program 33 — Electric Bass (Finger) |
| Drums | Synthesized kick/snare/hi-hat waveforms | GM channel 10 — real drum samples from SoundFont |

Enhanced mode still outputs WAV files with the same filenames — you use them in your DAW exactly the same way.

---

## 6. Troubleshooting

### The app won't open / SmartScreen blocks it

Click **More info → Run anyway** on the SmartScreen dialog. This happens because the installer isn't code-signed. The app is open source — you can inspect the code at [github.com/hakai197/tabtobackingtrack](https://github.com/hakai197/tabtobackingtrack).

---

### My file won't load / parse error

- **Guitar Pro files:** Make sure the extension is `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, or `.ptb`. Files saved as `.gp` but with an older format sometimes fail — try resaving from Guitar Pro or TuxGuitar.
- **ASCII tab:** The parser expects the standard six-line (`e B G D A E`) format used on Ultimate Guitar. Tab files that only contain chord diagrams (no note lines) will parse but return zero notes.
- **MIDI:** Type 0 and Type 1 MIDI files are supported. Type 2 (multi-song) is not.

---

### The detected BPM is wrong

This is common with ASCII tab files — they contain no tempo information. Just type the correct BPM in the Analysis panel BPM field. The app scales all note timings to match.

---

### The export folder dialog doesn't appear

Make sure at least one instrument checkbox is checked in the Export panel. The Export button is disabled when nothing is selected.

---

### Enhanced mode error: "Enhanced mode requires FluidSynth binary / SoundFont file"

The path check failed. Go back to [Section 5](#5-enhanced-audio-mode-setup) and use **Check FluidSynth Status** in the app to see exactly which file is missing and where it's expected.

Common mistakes:
- The SoundFont filename is wrong — it must be exactly `GeneralUser-GS.sf2`
- `fluidsynth.exe` was placed in the wrong folder — check that it's under `resources\fluidsynth\win\`
- The `%APPDATA%` path contains a space or non-ASCII character — try creating the folder manually via File Explorer rather than the command line

---

### The exported WAV files have no sound

This can happen if the source tab has notes outside a recognisable range, or if all notes parsed at velocity 0. Open the Analysis panel and check **Notes Detected** — if it shows 0, the parser didn't find any note data in the file. Try a different format for the same song, or verify the file opens correctly in Guitar Pro or TuxGuitar.

---

### The drums sound wrong / off-beat

The drum groove is generated from a pattern (Rock, Shuffle, Ballad, Pop) tiled across the song length. It's not derived from the drum tab notes — only the song duration is used. If you want the actual drum part from a Guitar Pro file, load the drum track and export MIDI, then load that MIDI into SSD or another drum plugin and trigger it from the actual MIDI events.

---

### I need help with something not covered here

Open an issue at [github.com/hakai197/tabtobackingtrack/issues](https://github.com/hakai197/tabtobackingtrack/issues). Include your OS version, the file format you're using, and what you expected vs. what happened.
