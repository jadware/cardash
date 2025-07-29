# CAN Log Viewer

A browser-based tool for visualizing and decoding candump-format CAN bus logs using a DBC file.

## ✨ Features

### 📁 File Handling
- **DBC support**: Load and parse `.dbc` files for signal definitions
- **Log support**: Load candump-style `.log` or `.txt` files
- **Drag & Drop**: Drop `.dbc` and `.log` files directly onto the page to load/replace
- **Persistent storage**: Remember loaded files using `localStorage`
- **Clear buttons**: UI controls to unload DBC/log files

### 📊 UI and Data Rendering
- **Virtualized Table**: Efficient scrollable table using Clusterize.js
- **Table Columns**:
  - Timestamp
  - Category (message ID / group)
  - Human-readable description (`CM_`)
  - Decoded, scaled signal value with units
- **Auto-scrolling**: Scrolls with playback/live input unless paused

### 🎛 Playback Controls
- **Play/Pause**
- **Speed control** (e.g. 0.5×, 1×, 2×)
- **Scroll position memory**: Resume from last viewed packet

### 🔎 Filtering
- **Unknown PIDs**: Filter out messages not defined in DBC
- **Top PIDs**: List most frequent PIDs with click-to-toggle filtering

### 🧩 DBC Integration
- Parses:
  - `BO_` for messages
  - `SG_` for signals
  - `CM_` for comments
- (Planned) `VAL_` for enumerations

### 🔌 Serial Streaming
- Connect to serial port via Web Serial API
- Receive live CAN data in candump format
- Playback controls hidden during live stream

---

## 🚀 Usage

1. Open `index.html` in a browser (via a local web server, not `file://`)
2. Load a `.dbc` file and a `.log` candump file
3. Use playback controls or connect to a serial stream
4. Drag-and-drop new files to replace contents
5. Filter and inspect decoded CAN messages live

## 🧱 Tech Stack

- HTML + Bootstrap
- Vanilla JS
- Clusterize.js for virtual scrolling
- Web Serial API

## Purpose
- knob temperature control and fan control
- blind spot monitoring LED's that auto-adjust to day/night
- DBC explorer / analyzer to follow one id over time in a graph or timeline of some kind
- ability to playback to a serial port, with control, for reverse engineering 3rd party devices
- synchronize to car's dashcams
- live recording mode that uses serial port
- live message tester

## TODO
- timeline view using SVG
- selectable in/out for time windows to isolate things
- read the systemutc to re-create real timestamps
- click to rename and store list of edits for identifying pids and taking notes on them
- undo/redo? with onscreen growl