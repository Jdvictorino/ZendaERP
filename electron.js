const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const createCustomMenu = require('./menu');

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, 'build/icon.png')
  });

  if (isDev) {
    win.loadURL('http://localhost:5177');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// --- MANEJADORES DE COMUNICACIÓN ---
ipcMain.on('get-user-data-path', (event) => {
  event.returnValue = app.getPath('userData');
});

ipcMain.handle('open-image-path', async (event, relativePath) => {
    const fullPath = path.join(app.getPath('userData'), relativePath);
    try {
        await shell.openPath(fullPath);
        return { success: true };
    } catch (error) {
        console.error('Failed to open path:', fullPath, error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-image-data-url', async (event, relativePath) => {
    const fullPath = path.join(app.getPath('userData'), relativePath);
    try {
        const data = fs.readFileSync(fullPath);
        const base64 = data.toString('base64');
        const mimeType = 'image/' + path.extname(fullPath).substring(1);
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error('Failed to read image file:', fullPath, error);
        return null;
    }
});

ipcMain.handle('save-image-as', async (event, relativePath) => {
    const sourcePath = path.join(app.getPath('userData'), relativePath);
    try {
        const { filePath } = await dialog.showSaveDialog({
            title: 'Guardar imagen como...',
            defaultPath: path.basename(sourcePath),
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }
            ]
        });

        if (filePath) {
            fs.copyFileSync(sourcePath, filePath);
            return { success: true, path: filePath };
        }
        return { success: false, reason: 'cancelled' };
    } catch (error) {
        console.error('Failed to save image:', error);
        return { success: false, error: error.message };
    }
});

// Impresión de HTML en Electron
ipcMain.handle('print-html', async (event, { htmlContent, options }) => {
  try {
    const printWin = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true }
    });
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    await new Promise(resolve => {
      printWin.webContents.on('did-finish-load', resolve);
    });
    printWin.webContents.print(options || { silent: false, printBackground: true });
    
    // Dejar margen de tiempo para que el spooler capture la data antes de cerrar la ventana invisible
    setTimeout(() => { if (!printWin.isDestroyed()) printWin.close(); }, 1000);
    return { success: true };
  } catch (err) {
    console.error('print-html error:', err);
    return { success: false, error: String(err) };
  }
});

// Lista de impresoras
ipcMain.handle('get-printers', async () => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    const printers = await win.webContents.getPrintersAsync();
    win.close();
    return printers.map(p => p.name);
  } catch(e) {
    console.error('get-printers error', e);
    return [];
  }
});

// Impresión ESC/POS opcional
ipcMain.handle('escpos-print', async (event, { blocks = [], printerName = '' }) => {
  try {
    let escpos;
    try { escpos = require('escpos'); } catch (e) { return { success: false, error: 'escpos no instalado' }; }
    try { escpos.USB = require('escpos-usb'); } catch (e) { /* optional */ }
    const device = escpos.USB ? new escpos.USB() : new escpos.Console();
    const options = { encoding: 'GB18030' };
    const printer = new escpos.Printer(device, options);
    const alignMap = { left: 'LT', center: 'CT', right: 'RT' };
    return await new Promise((resolve) => {
      device.open((err) => {
        if (err) { resolve({ success: false, error: String(err) }); return; }
        try {
          (blocks || []).forEach(b => {
            if (!b) return;
            const type = b.type || 'text';
            if (b.align) printer.align(alignMap[b.align] || 'LT');
            if (b.style) printer.style(b.style); // e.g., 'B' for bold
            if (type === 'text') {
              const txt = (b.text ?? '').toString();
              if (txt) printer.text(txt);
              if (b.newline) printer.text('');
            } else if (type === 'blank') {
              printer.text('');
            } else if (type === 'hr') {
              const ch = b.char || '-';
              const len = b.length || 32;
              printer.text(ch.repeat(len));
            }
          });
          printer.cut();
          printer.close();
          resolve({ success: true });
        } catch (e2) {
          resolve({ success: false, error: String(e2) });
        }
      });
    });
  } catch (err) {
    console.error('escpos-print error', err);
    return { success: false, error: String(err) };
  }
});

// Apertura de gaveta (ESC/POS pulse si disponible)
ipcMain.handle('open-cash-drawer', async () => {
  try {
    let escpos;
    try { escpos = require('escpos'); } catch (e) { return { success: false, error: 'escpos no instalado' }; }
    const usb = (() => { try { return require('escpos-usb'); } catch { return null; } })();
    const device = usb ? new usb() : null;
    if (!device) return { success: false, error: 'No hay dispositivo ESC/POS' };
    const printer = new escpos.Printer(device);
    device.open((err) => {
      if (err) return { success: false, error: String(err) };
      // Pulse drawer kick-out connector
      printer.cashdraw();
      printer.close();
    });
    return { success: true };
  } catch (err) {
    console.error('open-cash-drawer error', err);
    return { success: false, error: String(err) };
  }
});

app.whenReady().then(() => {
  const menu = createCustomMenu();
  Menu.setApplicationMenu(menu);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
