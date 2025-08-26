// electron/main.ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';

const isDev = !app.isPackaged;

let win: BrowserWindow | null = null;

async function createWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 620,
    resizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await win.loadURL(devServerUrl);
    // win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexHtml = path.join(__dirname, '../dist/index.html');
    await win.loadFile(indexHtml);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // En macOS, cierra cuando no hay ventanas si no quieres persistir
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
