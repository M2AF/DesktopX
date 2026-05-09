<div align="center">

# <img src="logo.png" alt="X" width="200" style="vertical-align: middle; margin-bottom: 8px;">

**The Next-Generation 3D Spatial Operating Environment**

---

<div align="center">

**Access DesktopX via:**

**www.desktopx.org/** 

---

</div>

[![Live on Abstract](https://img.shields.io/badge/Abstract-Live%20Now-00FFA3?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iYmxhY2siIGQ9Ik0xMiAyTDMgN3YxMGw5IDUgOS01VjdMMTIgMnptMCAyLjE4TDE5IDguMXY3LjhsLTcgMy45Mi03LTMuOTJWOC4xbDctMy45MnoiLz48L3N2Zz4=&logoColor=black)](https://portal.abs.xyz/stream/criptoejesus)
[![Join Discord](https://img.shields.io/badge/Discord-Join%20Server-5865F2?logo=discord&logoColor=white)](https://discord.gg/VNEDCKtjua)
[![Live on Kick](https://img.shields.io/badge/Kick-Live%20Now-53FC18?logo=kick&logoColor=black)](https://kick.com/criptoejesus)
[![Live on Twitch](https://img.shields.io/badge/Twitch-Live%20Now-9146FF?logo=twitch&logoColor=white)](https://twitch.tv/criptoejesus)
[![Live on YouTube](https://img.shields.io/badge/YouTube-Live%20Now-FF0000?logo=youtube&logoColor=white)](https://youtube.com/@criptoejesus)

</div>

---

## 🚀 Welcome to DesktopX

**DesktopX** is an immersive, browser-based 3D spatial desktop environment built entirely with standard web technologies (HTML, CSS, JS, and Three.js). It transforms your local file system, media, and web browsing into a fully interactive 3D room. 

Say goodbye to flat windows. Walk around your files, pin videos to the walls, drop a 3D model on the floor, and throw a party with your local music library!

---

## ✨ Features

### 🌐 **Immersive 3D Spatial Environment**
* **Walk Mode**: Roam freely around your desktop room using classic `WASD` controls and mouse look.
* **Forge Grab**: Seamlessly pick up, move, and rotate files, images, and 3D objects anywhere in the room. Snap them precisely to the walls or place them on the floor.
* **Customizable Hub**: Adjust your Field of View (FOV), movement speed, and aesthetic particle effects instantly from the settings menu.

### 📁 **Spatial File System & Media Previews**
* Load your local folders natively in the browser. 
* Interactive 3D icons spawn on your walls for images, videos, audio, text, and code.
* **Rich Preview Engine**: Double-click to view media on a sleek 2D glassmorphic overlay, or pin it persistently in 3D space.
* **3D Model Support**: Drag in `.glb` or `.fbx` files and they instantly spawn as physical objects in the room!

### 🎬 **Theatre Mode**
* A massive, built-in **3D Movie Screen** locked to your left wall. 
* Load local video files directly onto the screen.
* Dim the lights with a single click using the **Theatre Mode** overlay for a cinematic viewing experience.
* Includes chunky, tactile 3D control buttons (Play, Pause, Stop, Fullscreen).

### 🎧 **DJ Desk & Party Mode**
* A fully modeled 3D DJ Booth with spinning vinyl platters and a reactive audio waveform display.
* Load a folder of music and watch the room react to the beat!
* **Party Mode**: Activate dynamic floor grids, strobing neon lights, and adjust BPM effects on the fly. 

### ⬡ **ChainLens NFT Viewer**
* Enter an Ethereum wallet address (and Alchemy API key) to summon your digital collectibles into the 3D space.
* Turn your room into a personal gallery for your Web3 assets.

### 🎮 **Games Library**
* **Multi-Platform Support**: Seamlessly browse and launch games from **Steam**, **Xbox**, **GOG**, and **Epic Games** all in one unified library.
* **Smart Game Discovery**: Automatically scans your game installation directories across all platforms.
* **Provider Filters**: Sort and filter by platform to quickly find the games you want to play.
* **Search & Discovery**: Find games by name with instant search functionality.
* **One-Click Launch**: Launch any game directly from your 3D desktop—no need to alt-tab to launchers.
* **Game Metadata**: Displays game names, installation paths, and provider information at a glance.

### 🖧 **Web Player & YouTube Integrations**
* **Floating Web Panel**: Spawn a floating 3D web panel to browse Wikipedia, check the weather, or write code without leaving the room.
* **YouTube Support**: Search and cast YouTube videos directly to your 3D movie screen. Choose from unlimited content on demand.
* **Video Casting**: Convert YouTube URLs or search results and display them on your massive 3D screen for an immersive viewing experience.
* **Embedded YouTube Player**: Full playback controls (play, pause, seek, volume) built into the 3D interface.
* **YouTube Search Integration**: Search YouTube directly from the Web Player interface using the YouTube Data API v3 (requires API key configuration).
* **Multi-Format Support**: Supports standard YouTube URLs, short URLs (youtu.be), video IDs, and YouTube Shorts.

### 💾 **Persistent Layouts**
* Have the perfect room setup? **Save your layout!**
* DesktopX securely saves your pinned images, videos, 3D models, and games into `IndexedDB`.
* Export your room as a `save.json` file to share with friends or back up your masterpiece.

---

## 🎮 Controls

| Action | Key / Input |
| :--- | :--- |
| **Move Around** | `W`, `A`, `S`, `D` |
| **Look Around** | Mouse Movement (Walk Mode) |
| **Toggle Modes** | `TAB` (Switch between Walk Mode & Desktop UI) |
| **Interact / Open** | `Double Left-Click` |
| **Forge Grab** | `Hold Left-Click` on an object |
| **Rotate Object** | `Q` and `E` (while grabbing) |
| **Move Closer/Further** | `Mouse Scroll Wheel` (while grabbing) |
| **Toggle Wall Snap** | `X` (while grabbing) |

---

## 🛠️ Installation & Usage

DesktopX is completely client-side and requires zero build steps!

1. **Clone the repository:**
   ```bash
   git clone https://github.com/M2AF/DesktopX.git
   cd DesktopX/app
   ```

2. **Run it locally:**
   Because DesktopX uses advanced browser APIs (like the File System Access API and Blob URLs for 3D models), it is best served over a local web server.
   
   If you have Python installed, just run:
   ```bash
   python -m http.server 3333
   ```
   
3. **Open in Browser:**
   Navigate to `http://localhost:3333` in any modern web browser (Chrome/Edge recommended).

4. **Games Library Setup (Desktop/Electron only):**
   The Electron desktop app automatically detects games from Steam, Xbox, GOG, and Epic Games installations on your system. No additional setup required—just open the Games Library from the start menu!

5. **Ready for YouTube & Web Features?**
   The local server (`localhost:3333`) enables secure YouTube iframe proxying and enhanced web player features!

---

## 🎨 Design & Tech Stack
Built with ❤️ using:
- **HTML5 & CSS3** (Vanilla, Glassmorphism, CSS Variables)
- **Vanilla JavaScript** (ES6+)
- **Three.js** (WebGL 3D Rendering)
- **GLTFLoader & FBXLoader** (3D Model parsing)
- **Electron** (Desktop app packaging with game library integration)
- **YouTube Data API v3** (Search and metadata integration)

*Check out the [DESIGN.md](./DESIGN.md) for a deep dive into the architecture and spatial UX principles behind DesktopX.*