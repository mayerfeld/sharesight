const { app, BrowserWindow } = require('electron');
const path = require('node:path');
function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 900, minHeight: 680, backgroundColor: '#f5f7fa', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
