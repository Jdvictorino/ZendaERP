const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const createCustomMenu = require('./menu');
const { safeUserPath, isImagePath } = require('./safePath');

const isDev = !app.isPackaged;

// HTTP/3 (QUIC) por el túnel de Cloudflare corta descargas largas con net::ERR_QUIC_PROTOCOL_ERROR
app.commandLine.appendSwitch('disable-quic');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev,
    },
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  });

  if (isDev) {
    win.loadURL('http://localhost:5177');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// --- ACTUALIZACIONES AUTOMÁTICAS (OTA) ---
// El servidor decide por empresa (panel de plataforma) si responde con una versión nueva.
// Se descarga en segundo plano y se instala al cerrar la app, o antes si el usuario lo pide.
ipcMain.on('updates:check', (event, { token, apiUrl } = {}) => {
  if (isDev || !token || !apiUrl) return;
  autoUpdater.setFeedURL({ provider: 'generic', url: `${apiUrl.replace(/\/$/, '')}/updates` });
  autoUpdater.requestHeaders = { Authorization: `Bearer ${token}`, 'X-App-Version': app.getVersion() };
  // 404 = la empresa no tiene actualizaciones activadas; no es un error para el usuario
  autoUpdater.checkForUpdates().catch((error) => console.info('Sin actualización disponible:', error.message));
});

// Sin este oyente, un fallo de red al descargar se lanza como excepción no capturada (ventana de error)
autoUpdater.on('error', (error) => console.info('Actualización interrumpida:', error?.message || error));

autoUpdater.on('update-downloaded', (info) => {
  BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('updates:ready', { version: info.version }));
});

ipcMain.on('updates:install', () => autoUpdater.quitAndInstall());

// --- MANEJADORES DE COMUNICACIÓN ---
ipcMain.on('get-user-data-path', (event) => {
  event.returnValue = app.getPath('userData');
});

ipcMain.handle('open-image-path', async (event, relativePath) => {
    const fullPath = safeUserPath(app.getPath('userData'), relativePath);
    // shell.openPath puede lanzar programas: solo se abren imágenes dentro de la carpeta de la app
    if (!fullPath || !isImagePath(fullPath)) return { success: false, error: 'Ruta no permitida' };
    try {
        await shell.openPath(fullPath);
        return { success: true };
    } catch (error) {
        console.error('Failed to open path:', fullPath, error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-image-data-url', async (event, relativePath) => {
    const fullPath = safeUserPath(app.getPath('userData'), relativePath);
    if (!fullPath || !isImagePath(fullPath)) return null;
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
    const sourcePath = safeUserPath(app.getPath('userData'), relativePath);
    if (!sourcePath || !isImagePath(sourcePath)) return { success: false, error: 'Ruta no permitida' };
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

// Impresión de HTML en Electron (tickets térmicos y documentos)
ipcMain.handle('print-html', async (event, { htmlContent, options }) => {
  // Archivo temporal en vez de data: URL (un logo en base64 puede pasar el límite de una URL)
  const file = path.join(os.tmpdir(), `zenda-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  let printWin;
  try {
    fs.writeFileSync(file, htmlContent, 'utf8');
    // Ventana oculta normal: Chromium no imprime desde ventanas "offscreen".
    // Sin JavaScript: el HTML lleva datos que escriben los usuarios y solo debe imprimirse.
    printWin = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
    await printWin.loadFile(file); // ya resuelve cuando la página terminó de cargar
    const { deviceName, ...rest } = options || { silent: false };
    // El resultado real llega cuando la cola de impresión aceptó (o rechazó) el trabajo
    return await new Promise((resolve) => {
      printWin.webContents.print(
        { printBackground: true, margins: { marginType: 'none' }, ...rest, ...(deviceName ? { deviceName } : {}) },
        (success, failureReason) => resolve(success ? { success: true } : { success: false, error: failureReason })
      );
    });
  } catch (err) {
    console.error('print-html error:', err);
    return { success: false, error: String(err) };
  } finally {
    if (printWin && !printWin.isDestroyed()) printWin.close();
    fs.rm(file, { force: true }, () => {});
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
