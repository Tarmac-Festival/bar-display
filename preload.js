'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  onConfigChanged: (cb) => ipcRenderer.on('config:changed', (_e, cfg) => cb(cfg)),
  oeffneLink: (adresse) => ipcRenderer.invoke('link:oeffnen', adresse),

  paths: () => ipcRenderer.invoke('app:paths'),
  zeitStatus: () => ipcRenderer.invoke('zeit:status'),
  fernInfo: () => ipcRenderer.invoke('fern:info'),

  addMedia: () => ipcRenderer.invoke('media:add'),
  listMedia: () => ipcRenderer.invoke('media:list'),
  deleteMedia: (file) => ipcRenderer.invoke('media:delete', file),
  openMediaFolder: () => ipcRenderer.invoke('media:openFolder'),
  canConvert: () => ipcRenderer.invoke('media:canConvert'),
  convertMedia: (file) => ipcRenderer.invoke('media:convert', file),
  onConvertProgress: (cb) => ipcRenderer.on('convert:progress', (_e, d) => cb(d)),

  addPhoto: () => ipcRenderer.invoke('photo:add'),
  deletePhoto: (file) => ipcRenderer.invoke('photo:delete', file),
  openPhotoFolder: () => ipcRenderer.invoke('photo:openFolder'),
  cleanupPhotos: () => ipcRenderer.invoke('photo:cleanup'),

  addLogo: () => ipcRenderer.invoke('logo:add'),
  removeLogo: (f) => ipcRenderer.invoke('logo:remove', f),
  addFont: () => ipcRenderer.invoke('font:add'),
  removeFont: (f) => ipcRenderer.invoke('font:remove', f),

  exportTimetable: () => ipcRenderer.invoke('timetable:export'),
  importTimetable: () => ipcRenderer.invoke('timetable:import'),

  openSettings: () => ipcRenderer.invoke('settings:open'),
  closeSettings: () => ipcRenderer.invoke('settings:close'),
  quit: () => ipcRenderer.invoke('app:quit'),

  listDisplays: () => ipcRenderer.invoke('displays:list'),
  identifyDisplays: () => ipcRenderer.invoke('displays:identify'),

  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (v) => ipcRenderer.invoke('autostart:set', v),

  exportConfig: () => ipcRenderer.invoke('config:export'),
  importConfig: () => ipcRenderer.invoke('config:import')
});
