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

## 🛠️ Room Editor System

The Room Editor (`dx-room-editor.html`) is a standalone visual tool that allows users to customize every aspect of their 3D environment without writing code.

### Architecture
* **Modular Panel System**: The editor uses a tabbed interface with five specialized panels:
  - **ATMO Panel**: Controls atmosphere settings (fog color/density, sky gradients, star field, ambient lighting)
  - **LIGHTS Panel**: Manages point light sources with color and intensity controls
  - **MATS Panel**: Customizes material properties for floors, walls, grid lines, and accent colors; includes geometry controls (room size, wall height)
  - **ICONS Panel**: Manages appearance and behavior of 3D file icons
  - **PORTALS Panel**: Creates and configures spatial navigation portals

### File Format: `.dxroom`
* Room configurations are exported as `.dxroom` files—JSON structures containing:
  - Material color values (`fc`, `ac`, `f1`, `f2`, `w1`, `w2`, `gc`, `xc` for fog, ambient, floor, walls, grid, and accent)
  - Atmospheric parameters (fog density, star field state)
  - Light definitions (position, color, intensity)
  - Portal definitions and icon configurations
* `.dxroom` files are portable and shareable, enabling users to backup custom room designs or share them with the community.

### Real-Time Synchronization
* All editor changes are reflected instantly in the 3D preview viewport.
* The editor calculates and applies CSS color variables (`--bg`, `--panel`, `--acc`, `--dim`, etc.) in real time using a unified color system.

---

## 🎨 Color Presets System

DesktopX ships with six pre-designed color presets that instantly transform the visual identity of the 3D environment.

### Preset Architecture
Each preset is a complete `.dxroom` configuration stored in the preset library:
* **Deep Space**: Dark, cosmic palette with deep blues and purple accents
* **Lava Cave**: Warm oranges and reds with glowing emissive surfaces
* **Neon City**: Vibrant neon colors with high-contrast accent lighting
* **The Void**: Pure darkness with minimalist subtle gradients
* **Aurora**: Cool greens and cyans with ethereal atmosphere
* **Crimson**: Deep reds and burgundy tones with atmospheric fog

### Implementation
* Presets are applied by loading their complete room configuration and re-rendering the scene.
* The system uses a shared color variable framework (`--bg`, `--border`, `--acc`, `--gold`, `--tx`, `--dim`, etc.) defined in CSS.
* Users can modify a preset after loading it, creating hybrid custom themes that blend preset aesthetics with personal customization.

---

## 🧩 Mods System & Extensibility

DesktopX supports a community-driven mods system that allows developers to extend functionality and add new features without forking the codebase.

### Mod Architecture
* **Mod Format**: `.dxmod` files are JavaScript bundles that hook into the DesktopX runtime.
* **Mod Registry**: The Mods Panel (`#mods-panel`) is a fixed DOM sidebar that displays installed mods as cards.
  - Each mod card shows the mod name, unique ID, and action buttons (activate/deactivate/delete)
  - Mods can be toggled on and off without uninstalling

### Mod Lifecycle
1. **Import**: Users drag-and-drop or browse to load `.dxmod` files into their environment
2. **Registration**: The system assigns a unique mod ID and stores metadata (name, version, dependencies)
3. **Activation**: Mods hook into key DesktopX systems (scene updates, UI overlays, input handling)
4. **Deactivation**: Mods gracefully unload their features without corrupting the main environment

### Integration Points
Mods can extend:
* **Scene Graph**: Add custom 3D objects or modify existing geometry
* **UI Layer**: Inject custom panels, buttons, or HUD elements
* **File System**: Register custom file type handlers (e.g., proprietary 3D formats)
* **Input System**: Add custom keybinds or interaction patterns
* **Persistence**: Save/load custom data to IndexedDB alongside user layout saves

### Community & Distribution
* Mods are shared via Discord and the community portal
* The mod system uses semantic versioning and dependency resolution to prevent conflicts
* Popular community mods may be integrated into the core application in future releases

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
