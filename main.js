/**
 * DesktopX — Electron Main Process
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, protocol, session } = require('electron');
const path  = require('path');
const fs    = require('fs');
const http  = require('http');
const https = require('https');
const url   = require('url');
const { execFile, execFileSync, execSync } = require('child_process');
const os    = require('os');

const IS_DEV    = !app.isPackaged;
const APP_ROOT  = path.join(__dirname, 'app');
const PROXY_PORT = 3334;

let mainWindow  = null;
let tray        = null;
let proxyServer = null;
let SAVE_PATH   = null; // resolved after app is ready (userData folder)

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
    // transparent: true allows PNG alpha channels to render correctly (logo fix)
    transparent: true,
    backgroundColor: '#00000000',
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
    mainWindow.webContents.executeJavaScript(`
      window.ELECTRON_PROXY_PORT = ${PROXY_PORT};
      window.ELECTRON_MODE = true;
      window.DESKTOPX_SAVE_PATH = ${JSON.stringify(SAVE_PATH)};

      // ── Window controls injected directly from main process ──────────────
      // This guarantees controls appear even if electron-bridge.js doesn't load.
      (function injectWindowControls() {
        if (document.getElementById('__edx-bar')) return; // already injected by bridge

        // Drag region — covers topbar but leaves right side free for buttons
        const drag = document.createElement('div');
        drag.id = '__edx-drag';
        drag.style.cssText = [
          'position:fixed', 'top:0', 'left:0', 'right:90px', 'height:30px',
          '-webkit-app-region:drag', 'z-index:2147483646', 'pointer-events:none'
        ].join(';');
        document.body.appendChild(drag);

        // Button bar
        const bar = document.createElement('div');
        bar.id = '__edx-bar';
        bar.style.cssText = [
          'position:fixed', 'top:4px', 'right:6px',
          'display:flex', 'gap:3px', 'z-index:2147483647',
          '-webkit-app-region:no-drag'
        ].join(';');

        const btns = [
          { label:'—', title:'Minimize', action: () => window.electronAPI?.minimize(), hover:'rgba(255,255,255,0.22)' },
          { label:'⬜', title:'Maximize', action: () => window.electronAPI?.maximize(), hover:'rgba(255,255,255,0.22)' },
          { label:'✕', title:'Close',    action: () => window.electronAPI?.close(),    hover:'rgba(210,35,35,0.9)'   },
        ];

        btns.forEach(({ label, title, action, hover }) => {
          const b = document.createElement('button');
          b.textContent = label;
          b.title = title;
          b.style.cssText = [
            'width:26px', 'height:20px', 'border:none', 'border-radius:3px',
            'background:rgba(255,255,255,0.07)', 'color:rgba(255,255,255,0.78)',
            'font-size:10px', 'cursor:pointer', 'transition:background 0.1s',
            '-webkit-app-region:no-drag'
          ].join(';');
          b.addEventListener('mouseenter', () => b.style.background = hover);
          b.addEventListener('mouseleave', () => b.style.background = 'rgba(255,255,255,0.07)');
          b.addEventListener('click', action);
          bar.appendChild(b);
        });

        document.body.appendChild(bar);
        console.log('[DesktopX] Window controls injected ✓');
      })();
    `);
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

// ── IPC: Save file (userData — survives updates, writable in packaged builds) ─
ipcMain.handle('save:read', async () => {
  try {
    if (!SAVE_PATH) return null;
    return fs.existsSync(SAVE_PATH) ? fs.readFileSync(SAVE_PATH, 'utf-8') : null;
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle('save:write', async (_e, content) => {
  try {
    if (!SAVE_PATH) return { error: 'Save path not ready.' };
    fs.mkdirSync(path.dirname(SAVE_PATH), { recursive: true });
    fs.writeFileSync(SAVE_PATH, content, 'utf-8');
    return { success: true };
  } catch (e) { return { error: e.message }; }
});

// ── Game library scanners ───────────────────────────────────────────────────
const GAME_PROVIDER_LABELS = { steam: 'Steam', xbox: 'Xbox', gog: 'GOG', epic: 'Epic' };

function normalizeGameName(name) {
  return String(name || '')
    .replace(/[™®©]/g, '')
    .replace(/\b(game of the year|goty|edition|standard|deluxe|ultimate|windows|win10|xbox|pc)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSizeGb(bytes) {
  const n = Number(bytes || 0);
  return n > 0 ? (n / 1e9).toFixed(1) : null;
}

function cleanPathValue(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function execFileText(file, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 * 16, ...opts }, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; reject(err); return; }
      resolve(stdout || '');
    });
  });
}

async function runPowerShellJson(script) {
  if (process.platform !== 'win32') return null;
  const stdout = await execFileText('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script]);
  return safeJsonParse(stdout.trim(), null);
}

function makeGame(provider, fields) {
  const id = String(fields.id || fields.appId || fields.packageFamilyName || fields.appName || fields.name || '').trim();
  const name = String(fields.name || fields.displayName || id || 'Untitled Game').trim();
  return {
    provider,
    providerLabel: GAME_PROVIDER_LABELS[provider] || provider,
    id,
    name,
    searchName: normalizeGameName(name).toLowerCase(),
    ...fields,
  };
}

function uniqueGames(games) {
  const seen = new Set();
  const out = [];
  for (const game of games || []) {
    if (!game || !game.provider || !game.name) continue;
    const key = `${game.provider}:${game.id || game.appId || game.packageFamilyName || game.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(game);
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.provider).localeCompare(String(b.provider)));
}

function getWindowsDriveRoots() {
  if (process.platform !== 'win32') return [];
  const roots = [];
  for (let code = 67; code <= 90; code++) {
    const root = String.fromCharCode(code) + ':\\';
    try { if (fs.existsSync(root)) roots.push(root); } catch { /* inaccessible drive */ }
  }
  return roots;
}

function getXboxInstallRoots() {
  if (process.platform !== 'win32') return [];
  return uniquePaths(getWindowsDriveRoots().map(root => path.join(root, 'XboxGames')).filter(p => fs.existsSync(p)));
}

function uniquePaths(paths) {
  const seen = new Set();
  const out = [];
  for (const p of paths || []) {
    const key = String(p || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function readXboxGameFolders() {
  const games = [];
  for (const root of getXboxInstallRoots()) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(root, entry.name);
      const contentPath = path.join(folderPath, 'Content');
      const configPath = path.join(contentPath, 'MicrosoftGame.config');
      let config = '';
      try { if (fs.existsSync(configPath)) config = fs.readFileSync(configPath, 'utf8'); } catch { /* unreadable config */ }
      const titleMatch = config.match(/<Title[^>]*(?:Name|TitleName|DisplayName)="([^"]+)"/i) || config.match(/DisplayName="([^"]+)"/i);
      const identityMatch = config.match(/<Identity[^>]*Name="([^"]+)"/i);
      const executableMatch = config.match(/<Executable[^>]*Name="([^"]+)"/i);
      games.push({
        folderName: entry.name,
        name: titleMatch?.[1] || entry.name,
        packageName: identityMatch?.[1] || '',
        executable: executableMatch?.[1] || '',
        installLocation: folderPath,
        contentPath,
      });
    }
  }
  return games;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function startAppMatchesPackage(startApp, pkg) {
  const appId = String(startApp?.AppID || startApp?.AppId || startApp?.appId || '');
  const pfn = String(pkg?.PackageFamilyName || '');
  if (pfn && appId.toLowerCase().startsWith(pfn.toLowerCase() + '!')) return true;
  const packageName = String(pkg?.Name || '').toLowerCase();
  if (packageName && appId.toLowerCase().includes(packageName)) return true;
  return false;
}

function startAppMatchesFolder(startApp, folderGame) {
  const appName = normalizeGameName(startApp?.Name || '').toLowerCase();
  const folderName = normalizeGameName(folderGame?.name || folderGame?.folderName || '').toLowerCase();
  const appId = String(startApp?.AppID || '').toLowerCase();
  const packageName = String(folderGame?.packageName || '').toLowerCase();
  if (packageName && appId.includes(packageName)) return true;
  return appName && folderName && (appName === folderName || appName.includes(folderName) || folderName.includes(appName));
}

async function scanSteamLibrary() {
  try {
    let steamPath = null;

    if (process.platform === 'win32') {
      try {
        const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf-8' });
        const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
        if (match) steamPath = match[1].trim().replace(/\//g, '\\');
      } catch {
        try {
          const out = execSync('reg query "HKLM\\Software\\Wow6432Node\\Valve\\Steam" /v InstallPath', { encoding: 'utf-8' });
          const match = out.match(/InstallPath\s+REG_SZ\s+(.+)/i);
          if (match) steamPath = match[1].trim();
        } catch { return []; }
      }
    } else if (process.platform === 'linux') {
      const candidates = [path.join(os.homedir(), '.steam', 'steam'), path.join(os.homedir(), '.local', 'share', 'Steam')];
      steamPath = candidates.find(p => fs.existsSync(p)) || null;
    } else if (process.platform === 'darwin') {
      steamPath = path.join(os.homedir(), 'Library', 'Application Support', 'Steam');
    }

    if (!steamPath || !fs.existsSync(steamPath)) return [];

    const libraryFolders = [path.join(steamPath, 'steamapps')];
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    if (fs.existsSync(vdfPath)) {
      const vdf = fs.readFileSync(vdfPath, 'utf-8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/gi)) {
        const libApps = path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps');
        if (fs.existsSync(libApps) && !libraryFolders.includes(libApps)) libraryFolders.push(libApps);
      }
    }

    const games = [];
    const seenAppIds = new Set();
    for (const libPath of libraryFolders) {
      let entries;
      try { entries = fs.readdirSync(libPath); } catch { continue; }
      for (const entry of entries) {
        if (!entry.startsWith('appmanifest_') || !entry.endsWith('.acf')) continue;
        try {
          const acf = fs.readFileSync(path.join(libPath, entry), 'utf-8');
          const appId = (acf.match(/"appid"\s+"(\d+)"/i) || [])[1];
          const name = (acf.match(/"name"\s+"([^"]+)"/i) || [])[1];
          const sizeKb = (acf.match(/"SizeOnDisk"\s+"(\d+)"/i) || [])[1];
          if (appId && name && !seenAppIds.has(appId)) {
            seenAppIds.add(appId);
            games.push(makeGame('steam', {
              id: appId,
              appId,
              name,
              sizeGb: sizeKb ? (parseInt(sizeKb, 10) / 1e9).toFixed(1) : null,
              header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
              portrait: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
              launchType: 'steam',
              launchTarget: appId,
            }));
          }
        } catch { /* skip malformed acf */ }
      }
    }
    return uniqueGames(games);
  } catch { return []; }
}

async function scanXboxLibrary() {
  if (process.platform !== 'win32') return [];
  try {
    const folderGames = readXboxGameFolders();
    const ps = `
      $packages = Get-AppxPackage | Select-Object Name, PackageFamilyName, InstallLocation, Publisher, SignatureKind
      $startApps = Get-StartApps | Select-Object Name, AppID
      [pscustomobject]@{ Packages = $packages; StartApps = $startApps } | ConvertTo-Json -Depth 5
    `;
    const data = await runPowerShellJson(ps).catch(() => null);
    const packages = asArray(data?.Packages);
    const startApps = asArray(data?.StartApps);
    const xboxRoots = getXboxInstallRoots().map(p => p.toLowerCase());
    const games = [];

    for (const folderGame of folderGames) {
      const pkg = packages.find(p => {
        const loc = String(p.InstallLocation || '').toLowerCase();
        const pkgName = String(p.Name || '').toLowerCase();
        return loc && folderGame.contentPath && folderGame.contentPath.toLowerCase().startsWith(loc) ||
          (folderGame.packageName && pkgName === folderGame.packageName.toLowerCase());
      });
      const startApp = startApps.find(a => startAppMatchesPackage(a, pkg)) || startApps.find(a => startAppMatchesFolder(a, folderGame));
      const aumid = startApp?.AppID || startApp?.AppId || '';
      if (!aumid) continue;
      games.push(makeGame('xbox', {
        id: aumid,
        name: folderGame.name || startApp.Name,
        packageFamilyName: pkg?.PackageFamilyName || '',
        installLocation: folderGame.installLocation,
        launchType: 'xbox-aumid',
        launchTarget: { aumid },
      }));
    }

    for (const pkg of packages) {
      const installLocation = String(pkg.InstallLocation || '');
      const lowerLocation = installLocation.toLowerCase();
      const startsInXboxRoot = xboxRoots.some(root => lowerLocation.startsWith(root.toLowerCase()));
      const knownGamePackage = /halo|forza|minecraft|seaofthieves|flight|bethesda|zenimax|doublefine|obsidian|microsoft\.studios|microsoft\.gaming/i.test(String(pkg.Name || ''));
      if (!startsInXboxRoot && !knownGamePackage) continue;
      const startApp = startApps.find(a => startAppMatchesPackage(a, pkg));
      const aumid = startApp?.AppID || startApp?.AppId || '';
      if (!aumid) continue;
      games.push(makeGame('xbox', {
        id: aumid,
        name: startApp.Name || pkg.Name,
        packageFamilyName: pkg.PackageFamilyName,
        installLocation,
        launchType: 'xbox-aumid',
        launchTarget: { aumid },
      }));
    }

    return uniqueGames(games);
  } catch { return []; }
}

function parseRegistryGames(raw) {
  const records = [];
  let current = null;
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^HKEY_/i.test(trimmed)) {
      if (current) records.push(current);
      current = { registryKey: trimmed };
      continue;
    }
    const match = line.match(/^\s+([^\s]+)\s+REG_[A-Z0-9_]+\s+(.*)$/i);
    if (current && match) current[match[1].toLowerCase()] = match[2].trim();
  }
  if (current) records.push(current);
  return records;
}

function queryRegistryTree(key) {
  if (process.platform !== 'win32') return '';
  try { return execFileSync('reg', ['query', key, '/s'], { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 * 8 }); }
  catch { return ''; }
}

async function scanGogLibrary() {
  if (process.platform !== 'win32') return [];
  const keys = [
    'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games',
    'HKLM\\SOFTWARE\\GOG.com\\Games',
    'HKCU\\SOFTWARE\\GOG.com\\Games',
  ];
  const records = keys.flatMap(key => parseRegistryGames(queryRegistryTree(key)));
  const games = [];
  for (const rec of records) {
    const installLocation = cleanPathValue(rec.path || rec.installpath || rec.workingdir || '');
    const id = rec.gameid || rec.buildid || rec.registryKey?.split('\\').pop() || rec.gamename || '';
    const name = rec.gamename || rec.name || (installLocation ? path.basename(installLocation) : '');
    if (!name || !id) continue;
    games.push(makeGame('gog', {
      id,
      name,
      installLocation,
      launchType: 'gog',
      launchTarget: {
        command: cleanPathValue(rec.launchcommand || rec.launchpath || ''),
        exe: cleanPathValue(rec.exe || rec.executable || ''),
        installLocation,
        workingDir: cleanPathValue(rec.workingdir || installLocation),
      },
    }));
  }
  return uniqueGames(games);
}

async function scanEpicLibrary() {
  const candidates = [];
  if (process.platform === 'win32') {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    candidates.push(path.join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'));
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(os.homedir(), 'Library', 'Application Support', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'));
  } else {
    candidates.push(path.join(os.homedir(), '.config', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests'));
  }

  const games = [];
  for (const manifestsDir of candidates) {
    if (!fs.existsSync(manifestsDir)) continue;
    let entries = [];
    try { entries = fs.readdirSync(manifestsDir); } catch { continue; }
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.item')) continue;
      const manifest = safeJsonParse(fs.readFileSync(path.join(manifestsDir, entry), 'utf8'), null);
      if (!manifest) continue;
      const name = manifest.DisplayName || manifest.displayName || manifest.AppName || manifest.AppNameString || manifest.InstallLocation && path.basename(manifest.InstallLocation);
      const appName = manifest.AppName || manifest.AppId || manifest.AppIdString || '';
      const catalogItemId = manifest.CatalogItemId || manifest.MainGameCatalogItemId || '';
      const namespaceId = manifest.NamespaceId || manifest.CatalogNamespace || '';
      const id = appName || catalogItemId || manifest.InstallLocation || name;
      if (!name || !id) continue;
      games.push(makeGame('epic', {
        id,
        name,
        installLocation: manifest.InstallLocation || '',
        launchType: 'epic',
        launchTarget: {
          appName,
          catalogItemId,
          namespaceId,
          installLocation: manifest.InstallLocation || '',
          launchExecutable: manifest.LaunchExecutable || '',
          launchCommand: manifest.LaunchCommand || '',
        },
      }));
    }
  }
  return uniqueGames(games);
}

function getGogLaunchPath(target) {
  const command = cleanPathValue(target?.command || '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(command)) return { type: 'url', value: command };
  if (command && fs.existsSync(command)) return { type: 'path', value: command };
  const quoted = String(target?.command || '').match(/"([^"]+\.(?:exe|lnk|bat|cmd))"/i);
  if (quoted && fs.existsSync(quoted[1])) return { type: 'path', value: quoted[1] };
  const exe = cleanPathValue(target?.exe || '');
  const installLocation = cleanPathValue(target?.installLocation || '');
  if (exe && fs.existsSync(exe)) return { type: 'path', value: exe };
  if (exe && installLocation && fs.existsSync(path.join(installLocation, exe))) return { type: 'path', value: path.join(installLocation, exe) };
  if (installLocation && fs.existsSync(installLocation)) return { type: 'path', value: installLocation };
  return null;
}

async function launchUnifiedGame(game) {
  const provider = String(game?.provider || '').toLowerCase();
  const target = game?.launchTarget || game || {};
  if (provider === 'steam') {
    const appId = String(game.appId || game.id || target || '').replace(/[^0-9]/g, '');
    if (!appId) throw new Error('Steam app id missing.');
    await shell.openExternal(`steam://run/${appId}`);
    return { success: true };
  }
  if (provider === 'xbox') {
    const aumid = String(target.aumid || game.id || '').replace(/["'`]/g, '');
    if (!aumid) throw new Error('Xbox app id missing.');
    await execFileText('explorer.exe', [`shell:AppsFolder\\${aumid}`]);
    return { success: true };
  }
  if (provider === 'epic') {
    const appName = target.appName || game.id || '';
    if (!appName) throw new Error('Epic app name missing.');
    const encodedTriple = target.namespaceId && target.catalogItemId
      ? `${encodeURIComponent(target.namespaceId)}%3A${encodeURIComponent(target.catalogItemId)}%3A${encodeURIComponent(appName)}`
      : encodeURIComponent(appName);
    await shell.openExternal(`com.epicgames.launcher://apps/${encodedTriple}?action=launch&silent=true`);
    return { success: true };
  }
  if (provider === 'gog') {
    const launch = getGogLaunchPath(target);
    if (!launch) throw new Error('GOG launch target missing.');
    if (launch.type === 'url') await shell.openExternal(launch.value);
    else {
      const err = await shell.openPath(launch.value);
      if (err) throw new Error(err);
    }
    return { success: true };
  }
  throw new Error('Unknown game provider.');
}

async function scanAllGameLibraries() {
  const scanners = [scanSteamLibrary, scanXboxLibrary, scanGogLibrary, scanEpicLibrary];
  const settled = await Promise.allSettled(scanners.map(scanner => scanner()));
  const games = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  return uniqueGames(games);
}

async function safeLibraryResult(scanner) {
  try { return { games: await scanner() }; }
  catch (e) { return { error: e.message, games: [] }; }
}

ipcMain.handle('steam:getLibrary', async () => safeLibraryResult(scanSteamLibrary));

ipcMain.handle('steam:launchGame', async (_e, appId) => launchUnifiedGame({ provider: 'steam', appId, id: appId }));
ipcMain.handle('xbox:getLibrary', async () => safeLibraryResult(scanXboxLibrary));
ipcMain.handle('gog:getLibrary', async () => safeLibraryResult(scanGogLibrary));
ipcMain.handle('epic:getLibrary', async () => safeLibraryResult(scanEpicLibrary));
ipcMain.handle('xbox:launchGame', async (_e, aumid) => launchUnifiedGame({ provider: 'xbox', id: aumid, launchTarget: { aumid } }));
ipcMain.handle('gog:launchGame', async (_e, target) => launchUnifiedGame({ provider: 'gog', launchTarget: target }));
ipcMain.handle('epic:launchGame', async (_e, target) => launchUnifiedGame({ provider: 'epic', id: target?.appName, launchTarget: target }));

ipcMain.handle('games:getLibraries', async () => {
  try { return { games: await scanAllGameLibraries() }; }
  catch (e) { return { error: e.message, games: [] }; }
});

ipcMain.handle('games:launch', async (_e, game) => {
  try { return await launchUnifiedGame(game); }
  catch (e) { return { error: e.message }; }
});
// ── IPC: Window controls ─────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('window:close',    () => { app.isQuiting = true; mainWindow?.close(); });

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // ── Save path — writable userData folder (safe in packaged builds) ────────
  SAVE_PATH = path.join(app.getPath('userData'), 'save.json');
  // One-time migration: copy save.json from app/ folder if it exists and userData doesn't yet
  const legacySave = path.join(APP_ROOT, 'save.json');
  if (!fs.existsSync(SAVE_PATH) && fs.existsSync(legacySave)) {
    try {
      fs.mkdirSync(path.dirname(SAVE_PATH), { recursive: true });
      fs.copyFileSync(legacySave, SAVE_PATH);
      if (IS_DEV) console.log('[DesktopX] Migrated save.json →', SAVE_PATH);
    } catch (e) { console.warn('[DesktopX] Save migration failed:', e.message); }
  }

  // ── YouTube API referer spoof ─────────────────────────────────────────────
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
