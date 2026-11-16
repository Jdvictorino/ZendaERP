const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { safeUserPath } = require('./safePath');

contextBridge.exposeInMainWorld('electronAPI', {
  saveImage: (buffer, orderNumber, imageName) => {
    return new Promise((resolve, reject) => {
      try {
        // Pide la ruta de datos del usuario, que es una carpeta escribible.
        const userDataPath = ipcRenderer.sendSync('get-user-data-path');
        // Construye la ruta dentro de 'Client-images' y rechaza cualquier salida de la carpeta de datos.
        const rel = path.join('Client-images', String(orderNumber), String(imageName));
        const destPath = safeUserPath(userDataPath, rel);
        if (!destPath) return reject(new Error('Ruta no permitida'));

        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, buffer);

        // Devuelve la ruta relativa para guardarla en Firestore.
        resolve(rel.replace(/\\/g, '/'));
      } catch (error) {
        console.error('Error in preload saveImage:', error);
        reject(error);
      }
    });
  },
  openImagePath: (relativePath) => ipcRenderer.invoke('open-image-path', relativePath),
  getImageAsDataUrl: (relativePath) => ipcRenderer.invoke('get-image-data-url', relativePath),
  saveImageAs: (relativePath) => ipcRenderer.invoke('save-image-as', relativePath),
  printHTML: (htmlContent, options) => ipcRenderer.invoke('print-html', { htmlContent, options }),
  escposPrint: (blocks, printerName) => ipcRenderer.invoke('escpos-print', { blocks, printerName }),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  openCashDrawer: () => ipcRenderer.invoke('open-cash-drawer'),
  checkForUpdates: (token, apiUrl) => ipcRenderer.send('updates:check', { token, apiUrl }),
  onUpdateReady: (callback) => {
    const listener = (event, info) => callback(info);
    ipcRenderer.on('updates:ready', listener);
    return () => ipcRenderer.removeListener('updates:ready', listener);
  },
  installUpdate: () => ipcRenderer.send('updates:install'),
});
