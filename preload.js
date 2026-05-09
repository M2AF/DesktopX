const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialogs
  openFolder:     ()         => ipcRenderer.invoke('dialog:openFolder'),
  openFile:       (filters)  => ipcRenderer.invoke('dialog:openFile', filters),
  saveFileDialog: (name)     => ipcRenderer.invoke('dialog:saveFile', name),
  // File system
  readDir:        (p)        => ipcRenderer.invoke('fs:readDir', p),
  readFileBase64: (p)        => ipcRenderer.invoke('fs:readFileBase64', p),
  getFileUrl:     (p)        => ipcRenderer.invoke('fs:getFileUrl', p),
  writeFile:      (p, data)  => ipcRenderer.invoke('fs:writeFile', p, data),
  readText:       (p)        => ipcRenderer.invoke('fs:readText', p),
  showInFolder:   (p)        => ipcRenderer.invoke('shell:showItemInFolder', p),
  // Window controls
  minimize:       ()         => ipcRenderer.send('window:minimize'),
  maximize:       ()         => ipcRenderer.send('window:maximize'),
  close:          ()         => ipcRenderer.send('window:close'),
  // Game libraries
  getGameLibraries: ()       => ipcRenderer.invoke('games:getLibraries'),
  launchGame:      (game)    => ipcRenderer.invoke('games:launch', game),
  // Store-specific fallbacks
  getSteamLibrary: ()        => ipcRenderer.invoke('steam:getLibrary'),
  launchSteamGame: (appId)   => ipcRenderer.invoke('steam:launchGame', appId),
  getXboxLibrary:  ()        => ipcRenderer.invoke('xbox:getLibrary'),
  launchXboxGame:  (aumid)   => ipcRenderer.invoke('xbox:launchGame', aumid),
  getGogLibrary:   ()        => ipcRenderer.invoke('gog:getLibrary'),
  launchGogGame:   (target)  => ipcRenderer.invoke('gog:launchGame', target),
  getEpicLibrary:  ()        => ipcRenderer.invoke('epic:getLibrary'),
  launchEpicGame:  (target)  => ipcRenderer.invoke('epic:launchGame', target),
  // Save (userData path — writable in packaged builds)
  saveRead:        ()        => ipcRenderer.invoke('save:read'),
  saveWrite:       (content) => ipcRenderer.invoke('save:write', content),
  // Environment
  isElectron: true,
  platform:   process.platform,
});
