/**
 * DesktopX — Electron Main Process
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, protocol, session } = require('electron');
const path  = require('path');
const fs    = require('fs');
const http  = require('http');
const https = require('https');
const url   = require('url');
const { execSync } = require('child_process');
const os    = require('os');

const IS_DEV    = !app.isPackaged;
const APP_ROOT  = path.join(__dirname, 'app');
const PROXY_PORT = 3334;

let mainWindow = null;
let tray       = null;
let proxyServer = null;

// ── YouTube + Local-file proxy server ────────────────────────────────────────
function startProxyServer() {
  proxyServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── /localfile/<absolute-path>  serve any local file efficiently ──
    if (req.url.startsWith('/localfile/')) {
      const filePath = decodeURIComponent(req.url.slice('/localfile/'.length));
      // Reconstruct Windows paths: /localfile/C:/Users/... → C:\Users\...
      const nativePath = process.platform === 'win32'
        ? filePath.replace(/\//g, '\\')
        : '/' + filePath;
      try {
        const stat = fs.statSync(nativePath);
        const ext  = path.extname(nativePath).slice(1).toLowerCase();
        const mime = ({
          png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
          webp:'image/webp', svg:'image/svg+xml', bmp:'image/bmp',
          mp4:'video/mp4', webm:'video/webm', mkv:'video/x-matroska',
          mov:'video/quicktime', avi:'video/x-msvideo',
          mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav',
          flac:'audio/flac', aac:'audio/aac', m4a:'audio/mp4',
          glb:'model/gltf-binary', gltf:'model/gltf+json',
          fbx:'application/octet-stream', obj:'text/plain',
          txt:'text/plain', md:'text/markdown', json:'application/json',
          pdf:'application/pdf',
        })[ext] || 'application/octet-stream';

        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'bytes');
        fs.createReadStream(nativePath).pipe(res);
      } catch (e) {
        res.writeHead(404); res.end('Not found: ' + e.message);
      }
      return;
    }

    // ── /proxy?target=<url>  YouTube / external URL proxy ──────────────
    const parsedUrl = url.parse(req.url, true);
    const target    = parsedUrl.query.target;
    if (!target) { res.writeHead(400); res.end('Missing ?target='); return; }

    try {
      const targetUrl  = new URL(target);
      const isHttps    = targetUrl.protocol === 'https:';
      const options    = {
        hostname: targetUrl.hostname,
        port:     targetUrl.port || (isHttps ? 443 : 80),
        path:     targetUrl.pathname + targetUrl.search,
        method:   'GET',
        headers:  { 'User-Agent': 'Mozilla/5.0 (DesktopX)' },
      };
      const proto = isHttps ? https : http;
      const proxyReq = proto.request(options, (proxyRes) => {
        const headers = { ...proxyRes.headers };
        delete headers['x-frame-options'];
        delete headers['content-security-policy'];
        delete headers['content-security-policy-report-only'];
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res, { end: true });
      });
      proxyReq.on('error', (e) => { res.writeHead(502); res.end(e.message); });
      req.pipe(proxyReq, { end: true });
    } catch (e) { res.writeHead(400); res.end(e.message); }
  });

  proxyServer.listen(PROXY_PORT, '127.0.0.1', () => {
    if (IS_DEV) console.log(`[DesktopX] Proxy server on http://127.0.0.1:${PROXY_PORT}`);
  });
}

// ── Main window ──────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1600, height: 900,
    minWidth: 800, minHeight: 600,
    frame: false,
    backgroundColor: '#000000',
    icon: path.join(APP_ROOT, 'favicon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webviewTag:       true,
    },
  });

  mainWindow.loadFile(path.join(APP_ROOT, 'index.html'));
  if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(
      `window.ELECTRON_PROXY_PORT=${PROXY_PORT}; window.ELECTRON_MODE=true;`
    );
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── System tray ──────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(APP_ROOT, 'favicon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('DesktopX');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open DesktopX', click: () => mainWindow?.show() },
    { label: 'Reload',        click: () => mainWindow?.webContents.reload() },
    { type: 'separator' },
    { label: 'Quit',          click: () => { app.isQuiting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => mainWindow?.show());
}

// ── IPC: File system ─────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:openFile', async (_e, filters = []) => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:saveFile', async (_e, name = 'save.json') => {
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: name,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('fs:readDir', async (_e, dirPath) => {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).map(e => ({
      name:        e.name,
      isDirectory: e.isDirectory(),
      path:        path.join(dirPath, e.name),
      ext:         path.extname(e.name).toLowerCase(),
      size:        e.isDirectory() ? 0 : (() => { try { return fs.statSync(path.join(dirPath, e.name)).size; } catch { return 0; } })(),
    }));
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle('fs:readFileBase64', async (_e, filePath) => {
  try { return fs.readFileSync(filePath).toString('base64'); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('fs:getFileUrl',  (_e, filePath) => url.pathToFileURL(filePath).href);
ipcMain.handle('fs:writeFile',   async (_e, filePath, content) => {
  try { fs.writeFileSync(filePath, content, 'utf-8'); return { success: true }; }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('fs:readText', async (_e, filePath) => {
  try { return fs.readFileSync(filePath, 'utf-8'); }
  catch (e) { return { error: e.message }; }
});
ipcMain.handle('shell:showItemInFolder', (_e, filePath) => shell.showItemInFolder(filePath));

// ── IPC: Steam library scanner ────────────────────────────────────────────────
ipcMain.handle('steam:getLibrary', async () => {
  try {
    let steamPath = null;

    if (process.platform === 'win32') {
      try {
        const out = execSync(
          'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath',
          { encoding: 'utf-8' }
        );
        const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
        if (match) steamPath = match[1].trim().replace(/\//g, '\\');
      } catch {
        // Try 32-bit registry fallback
        try {
          const out = execSync(
            'reg query "HKLM\\Software\\Wow6432Node\\Valve\\Steam" /v InstallPath',
            { encoding: 'utf-8' }
          );
          const match = out.match(/InstallPath\s+REG_SZ\s+(.+)/i);
          if (match) steamPath = match[1].trim();
        } catch { return { error: 'Steam installation not found in registry.' }; }
      }
    } else if (process.platform === 'linux') {
      const candidates = [
        path.join(os.homedir(), '.steam', 'steam'),
        path.join(os.homedir(), '.local', 'share', 'Steam'),
      ];
      steamPath = candidates.find(p => fs.existsSync(p)) || null;
    } else if (process.platform === 'darwin') {
      steamPath = path.join(os.homedir(), 'Library', 'Application Support', 'Steam');
    }

    if (!steamPath || !fs.existsSync(steamPath)) {
      return { error: 'Steam folder not found. Is Steam installed?' };
    }

    // Collect all steamapps library folders
    const libraryFolders = [path.join(steamPath, 'steamapps')];
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    if (fs.existsSync(vdfPath)) {
      const vdf = fs.readFileSync(vdfPath, 'utf-8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/gi)) {
        const libApps = path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps');
        if (fs.existsSync(libApps) && !libraryFolders.includes(libApps))
          libraryFolders.push(libApps);
      }
    }

    // Scan every library for appmanifest_*.acf files
    const games = [];
    for (const libPath of libraryFolders) {
      let entries;
      try { entries = fs.readdirSync(libPath); } catch { continue; }
      for (const entry of entries) {
        if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue;
        try {
          const acf    = fs.readFileSync(path.join(libPath, entry), 'utf-8');
          const appId  = (acf.match(/"appid"\s+"(\d+)"/i)   || [])[1];
          const name   = (acf.match(/"name"\s+"([^"]+)"/i)  || [])[1];
          const sizeKb = (acf.match(/"SizeOnDisk"\s+"(\d+)"/i) || [])[1];
          if (appId && name) {
            games.push({
              appId,
              name,
              sizeGb:  sizeKb ? (parseInt(sizeKb) / 1e9).toFixed(1) : null,
              header:  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
              portrait:`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
            });
          }
        } catch { /* skip malformed acf */ }
      }
    }

    // Sort alphabetically
    games.sort((a, b) => a.name.localeCompare(b.name));
    return { games };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('steam:launchGame', async (_e, appId) => {
  try {
    await shell.openExternal(`steam://run/${appId}`);
    return { success: true };
  } catch (e) { return { error: e.message }; }
});

// ── IPC: Window controls ─────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window:close',    () => { app.isQuiting = true; mainWindow?.close(); });

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // ── YouTube API referer spoof ───────────────────────────────────────────────
  // Injects the authorized origin so your locked API key is always accepted.
  // Change AUTHORIZED_ORIGIN to match the domain you registered in Google Console.
  const AUTHORIZED_ORIGIN = 'https://desktopx.org';
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.googleapis.com/*', 'https://*.youtube.com/*', 'https://www.youtube.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = AUTHORIZED_ORIGIN + '/';
      details.requestHeaders['Origin']  = AUTHORIZED_ORIGIN;
      callback({ requestHeaders: details.requestHeaders });
    }
  );
  // Strip X-Frame-Options so YouTube embeds are never blocked
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['https://www.youtube.com/embed/*', 'https://*.youtube.com/*'] },
    (details, callback) => {
      const h = details.responseHeaders;
      delete h['x-frame-options'];
      delete h['X-Frame-Options'];
      callback({ cancel: false, responseHeaders: h });
    }
  );

  startProxyServer();
  createWindow();
  createTray();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { proxyServer?.close(); app.quit(); }
});
app.on('before-quit', () => { app.isQuiting = true; proxyServer?.close(); });
