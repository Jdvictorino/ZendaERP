const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  saveImage: (buffer, orderNumber, imageName) => {
    return new Promise((resolve, reject) => {
      try {
        // Pide la ruta de datos del usuario, que es una carpeta escribible.
        const userDataPath = ipcRenderer.sendSync('get-user-data-path');
        // Construye la ruta de destino dentro de la carpeta 'Client-images'.
        const destDir = path.join(userDataPath, 'Client-images', orderNumber);
        
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        const destPath = path.join(destDir, imageName);
        fs.writeFileSync(destPath, buffer);

        // Devuelve la ruta relativa para guardarla en Firestore.
        resolve(path.join('Client-images', orderNumber, imageName).replace(/\\/g, '/'));
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
});
