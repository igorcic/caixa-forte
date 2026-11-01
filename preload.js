// Ponte segura entre a tela (renderer) e o banco (processo principal).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('caixaForteDB', {
  status: () => ipcRenderer.invoke('db:status'),
  getConfig: () => ipcRenderer.invoke('db:getConfig'),
  connect: cfg => ipcRenderer.invoke('db:connect', cfg),
  load: () => ipcRenderer.invoke('db:load'),
  saveAll: state => ipcRenderer.invoke('db:saveAll', state),
  logRelatorio: info => ipcRenderer.invoke('db:logRelatorio', info),
  listRelatorios: () => ipcRenderer.invoke('db:listRelatorios')
});
