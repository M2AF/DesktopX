/**
 * DesktopX — Electron Bridge (v2)
 * Fixes IDB DataCloneError by making handle methods non-enumerable.
 * No-op when running in a normal browser.
 */
(function () {
  'use strict';
  if (!window.electronAPI) return;
  const api = window.electronAPI;
  console.log('[DesktopX] Electron bridge active');

  window.PROXY_BASE_URL = `http://127.0.0.1:${window.ELECTRON_PROXY_PORT || 3334}`;

  function getMime(ext) {
    return ({
      png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',
      webp:'image/webp',svg:'image/svg+xml',bmp:'image/bmp',
      mp4:'video/mp4',webm:'video/webm',mkv:'video/x-matroska',
      mov:'video/quicktime',avi:'video/x-msvideo',
      mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',
      flac:'audio/flac',aac:'audio/aac',m4a:'audio/mp4',
      glb:'model/gltf-binary',gltf:'model/gltf+json',
      fbx:'application/octet-stream',obj:'text/plain',
      txt:'text/plain',md:'text/markdown',html:'text/html',
      css:'text/css',js:'text/javascript',ts:'text/typescript',
      json:'application/json',xml:'application/xml',
      py:'text/x-python',c:'text/x-csrc',cpp:'text/x-c++src',
      h:'text/x-chdr',sh:'text/x-shellscript',
      pdf:'application/pdf',zip:'application/zip',
    })[ext] || 'application/octet-stream';
  }

  // ── File handle ────────────────────────────────────────────────────────────
  function createNativeFileHandle(filePath) {
    filePath = filePath.replace(/\\/g, '/');
    const name = filePath.split('/').pop();
    const ext  = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const mime = getMime(ext);
    // Enumerable props only — IDB can serialize these safely
    const handle = { kind:'file', name, _path:filePath, _isElectronFsHandle:true, _isFile:true };
    // Non-enumerable methods — IDB structured clone skips functions entirely
    Object.defineProperties(handle, {
      getFile: { configurable:true, value: async function() {
        try {
          // Stream via proxy /localfile endpoint — no base64 overhead for large files
          const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;
          const proxyUrl = `http://127.0.0.1:${window.ELECTRON_PROXY_PORT||3334}/localfile/${normalized}`;
          const res = await fetch(proxyUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          return new File([blob], name, { type: mime });
        } catch {
          // Fallback: base64 over IPC
          const b64 = await api.readFileBase64(filePath);
          if (b64 && b64.error) throw new Error(b64.error);
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          return new File([bytes], name, { type: mime });
        }
      }},
      queryPermission:   { configurable:true, value: async () => 'granted' },
      requestPermission: { configurable:true, value: async () => 'granted' },
    });
    return handle;
  }

  // ── Directory handle ───────────────────────────────────────────────────────
  function createNativeDirectoryHandle(dirPath) {
    dirPath = dirPath.replace(/\\/g, '/');
    const name = dirPath.split('/').filter(Boolean).pop() || dirPath;
    const handle = { kind:'directory', name, _path:dirPath, _isElectronFsHandle:true };
    Object.defineProperties(handle, {
      entries: { configurable:true, value: async function*() {
        const items = await api.readDir(dirPath);
        if (!items || items.error) { console.error('[Bridge] readDir error:', items?.error); return; }
        for (const item of items) {
          yield [item.name, item.isDirectory
            ? createNativeDirectoryHandle(item.path)
            : createNativeFileHandle(item.path)];
        }
      }},
      values: { configurable:true, value: async function*() {
        for await (const [, h] of handle.entries()) yield h;
      }},
      keys: { configurable:true, value: async function*() {
        for await (const [n] of handle.entries()) yield n;
      }},
      getFileHandle:      { configurable:true, value: async (n) => createNativeFileHandle(dirPath+'/'+n) },
      getDirectoryHandle: { configurable:true, value: async (n) => createNativeDirectoryHandle(dirPath+'/'+n) },
      queryPermission:    { configurable:true, value: async () => 'granted' },
      requestPermission:  { configurable:true, value: async () => 'granted' },
    });
    return handle;
  }

  // ── IDB get interceptor — reconstruct live handle from stored plain data ───
  const _origGet       = IDBObjectStore.prototype.get;
  const _origResultGet = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result').get;
  IDBObjectStore.prototype.get = function(key) {
    const req = _origGet.call(this, key);
    Object.defineProperty(req, 'result', {
      configurable: true,
      get() {
        const raw = _origResultGet.call(this);
        if (raw && raw._isElectronFsHandle)
          return raw._isFile ? createNativeFileHandle(raw._path) : createNativeDirectoryHandle(raw._path);
        return raw;
      }
    });
    return req;
  };

  // ── showDirectoryPicker polyfill ───────────────────────────────────────────
  window.showDirectoryPicker = async function() {
    const p = await api.openFolder();
    if (!p) throw new DOMException('The user aborted a request.', 'AbortError');
    return createNativeDirectoryHandle(p);
  };

  // ── showOpenFilePicker polyfill ────────────────────────────────────────────
  window.showOpenFilePicker = async function(options = {}) {
    const filters = (options.types || []).map(t => ({
      name: t.description || 'Files',
      extensions: Object.values(t.accept || {}).flat().map(e => e.replace(/^\./, '')),
    }));
    const p = await api.openFile(filters.length ? filters : undefined);
    if (!p) throw new DOMException('The user aborted a request.', 'AbortError');
    return [createNativeFileHandle(p)];
  };

  // ── Native save.json export ────────────────────────────────────────────────
  window.electronSaveJSON = async function(json, name = 'save.json') {
    const p = await api.saveFileDialog(name);
    if (!p) return false;
    return !(await api.writeFile(p, json)).error;
  };

  // ── Frameless window controls ──────────────────────────────────────────────
  function injectControls() {
    if (document.getElementById('__edx-bar')) return;
    const drag = document.createElement('div');
    drag.style.cssText = 'position:fixed;top:0;left:0;right:0;height:30px;-webkit-app-region:drag;z-index:2147483646;pointer-events:none';
    document.body.appendChild(drag);
    const bar = document.createElement('div');
    bar.id = '__edx-bar';
    bar.style.cssText = 'position:fixed;top:4px;right:6px;display:flex;gap:3px;z-index:2147483647';
    [['—','Minimize',()=>api.minimize(),'rgba(255,255,255,0.2)'],
     ['⬜','Maximize',()=>api.maximize(),'rgba(255,255,255,0.2)'],
     ['✕','Close',   ()=>api.close(),   'rgba(220,40,40,0.85)']
    ].forEach(([l,t,fn,hov]) => {
      const b = document.createElement('button');
      b.textContent=l; b.title=t;
      b.style.cssText='width:26px;height:20px;border:none;border-radius:3px;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.75);font-size:10px;cursor:pointer;-webkit-app-region:no-drag;transition:background 0.1s';
      b.onmouseenter=()=>b.style.background=hov;
      b.onmouseleave=()=>b.style.background='rgba(255,255,255,0.07)';
      b.onclick=fn; bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', injectControls);
  else injectControls();

  console.log('[DesktopX] Bridge ready ✓');
})();
