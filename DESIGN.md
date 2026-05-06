# 📐 DesktopX Design Document

This document outlines the core architecture, design philosophy, and technical implementation details of **DesktopX**.

---

## 🏗️ Core Architecture

DesktopX operates on a hybrid architecture that seamlessly blends a **WebGL 3D environment** with a **standard DOM UI overlay**. 

### 1. The 3D Engine (Three.js)
The spatial environment is powered entirely by `Three.js`. It handles:
* Scene rendering, lighting, and shadow mapping.
* First-person camera controls (`yaw` and `pitch`).
* Raycasting for interactive elements (clicking buttons, dragging objects).
* Texture management for dynamic media (VideoTextures for MP4s, CanvasTextures for dynamic UIs).

### 2. The HTML/CSS Overlay (The "Glass" Layer)
Rather than building complex 2D UI elements in WebGL, DesktopX relies heavily on a standard DOM overlay layered on top of the `<canvas>`.
* **CSS Glassmorphism**: High use of `backdrop-filter: blur()`, semi-transparent backgrounds, and glowing borders (`box-shadow`) to create a futuristic, heads-up-display (HUD) aesthetic.
* **Responsive State**: Elements like the Taskbar, Start Menu, and Web Player modals are standard HTML `<div>` elements, ensuring crisp text rendering and native accessibility.

---

## 🧠 Scene Graph Strategy: The Dual-Group Pattern

To solve the complex problem of rendering permanent room fixtures alongside dynamic, user-loaded files, DesktopX uses a "Dual-Group" strategy.

1. **`staticHubGroup` (The Permanent Room)**
   * Contains the foundational architecture: walls, floors, ceilings.
   * Contains fixed interactive installations: The DJ Desk, The Movie Screen, The Theatre Controls.
   * **Rule:** Elements in this group are *never* cleared or destroyed when a user changes directories.

2. **`dynamicFileGroup` (The Ephemeral Files)**
   * Contains all the spawned 3D icons representing files in the currently viewed local directory.
   * **Rule:** This group is completely cleared and rebuilt every time the user navigates into a new local folder.

This separation ensures that complex, stateful objects (like a playing video texture on the Movie Screen) are never accidentally garbage-collected when browsing files.

---

## 💿 Persistence Layer

DesktopX allows users to curate a room layout and save it persistently.

### IndexedDB & Blobs
Because Web browsers cannot hold direct references to local files across sessions (due to security policies), DesktopX uses **IndexedDB** to store file data.
* When a user "Pins" a file to the wall, a Blob is created and stored in the database.
* The system saves the object's `position`, `rotation`, `scale`, and metadata.

### The Save.json Export
Users can export their room as a portable `.json` file.
* **MIME-Type Strictness**: During export, files are converted to `Base64` strings. DesktopX strictly enforces MIME types based on file extensions (e.g., forcing `model/gltf-binary` for `.glb` files) rather than relying on browser-inferred blob types, which often misidentify binary 3D models as `text/plain`.
* Upon importing a `save.json`, the Base64 strings are re-hydrated into Blobs with the explicitly defined MIME types, ensuring the `GLTFLoader` can parse them flawlessly.

---

## 🎨 UI/UX & Interaction Design

### "Walk Forge" Paradigm
DesktopX merges first-person navigation ("Walk Mode") with spatial manipulation ("Forge Mode").
* Holding `Left Mouse Button` on an object instantly initiates a Raycast-based drag interaction.
* Objects are dynamically re-parented and their world transforms are calculated relative to the camera vector.
* **Grid Snapping**: A math-based wall registry ensures that items snap cleanly to walls without overlapping.

### Emojis as Universal Icons
To keep the application lightweight and visually distinct without loading external icon libraries (like FontAwesome), DesktopX uses native Unicode Emojis (📁, 🎬, ⚙️, ▶) heavily in both DOM overlays and 3D Canvas textures. 

### Unified Media Engines
* **GlobalPlayer (Audio)**: A singleton HTML5 `Audio` instance. It survives scene transitions, powers the 3D DJ Desk visualizer (via `AudioContext` and `AnalyserNode`), and links to the 2D taskbar widget.
* **GlobalVideoPlayer (Video)**: A hidden HTML5 `<video>` element. By keeping the video element permanently in the DOM, DesktopX can seamlessly swap its output between a floating 2D preview window and the massive 3D WebGL Movie Screen texture without interrupting playback.
