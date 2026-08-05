import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import icon from '../../resources/icon.png?asset'
import { checkFluidSynth, renderMidiToWav } from './fluidsynth'
import { writeTempMidi } from './midiWriter'

// ── Auto-updater configuration ──────────────────────────────
autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

let mainWindow: BrowserWindow | null = null

autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('update-available', {
    version: info.version,
    releaseNotes: info.releaseNotes
  })
})

autoUpdater.on('update-not-available', () => {
  // Silently do nothing
})

autoUpdater.on('error', (err) => {
  log.error('AutoUpdater error:', err)
})

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('update-download-progress', {
    percent: Math.round(progress.percent)
  })
})

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-downloaded')
})

// ── Window creation ─────────────────────────────────────────
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show()
    if (app.isPackaged) {
      void autoUpdater.checkForUpdates()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const menu = Menu.buildFromTemplate([
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            if (app.isPackaged) {
              void autoUpdater.checkForUpdates()
            }
          }
        },
        {
          label: 'About Tab to Backing Track',
          click: () => {
            void dialog.showMessageBox(mainWindow!, {
              title: 'Tab to Backing Track',
              message: 'Tab to Backing Track',
              detail: `Version: ${app.getVersion()}\nFree and open source\ngithub.com/hakai197/tabtobackingtrack`,
              buttons: ['OK']
            })
          }
        }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── App lifecycle ───────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // ── Standard export IPC ──────────────────────────────────
  ipcMain.handle('export-session', async (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const picked = await dialog.showOpenDialog(win!, {
      title: 'Choose export folder',
      buttonLabel: 'Export Here',
      properties: ['openDirectory', 'createDirectory']
    })

    if (picked.canceled || picked.filePaths.length === 0) {
      return { canceled: true }
    }

    const folder = picked.filePaths[0]
    try {
      await Promise.all(
        payload.files.map((f: { filename: string; data: ArrayBuffer | string }) => {
          if (typeof f.data === 'string') {
            return writeFile(join(folder, f.filename), f.data, 'utf-8')
          }
          return writeFile(join(folder, f.filename), Buffer.from(f.data))
        })
      )
      return { canceled: false, folder }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Write failed'
      return { canceled: false, folder, error: message }
    }
  })

  // ── Enhanced audio IPC ───────────────────────────────────
  ipcMain.handle('check-fluidsynth', () => {
    return checkFluidSynth()
  })

  ipcMain.handle('pick-export-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const picked = await dialog.showOpenDialog(win!, {
      title: 'Choose export folder',
      buttonLabel: 'Export Here',
      properties: ['openDirectory', 'createDirectory']
    })
    if (picked.canceled || picked.filePaths.length === 0) {
      return { canceled: true }
    }
    return { canceled: false, folder: picked.filePaths[0] }
  })

  ipcMain.handle('render-instrument-wav-enhanced', async (_event, params) => {
    try {
      const midiPath = await writeTempMidi(
        params.notes,
        params.instrument,
        params.bpm,
        params.timeSignature,
        params.gmProgram,
        params.drumKitVariation
      )
      const outputPath = join(params.folder, params.filename)
      await renderMidiToWav(midiPath, outputPath)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Render failed' }
    }
  })

  ipcMain.handle('write-text-file', async (_event, params) => {
    try {
      await writeFile(join(params.folder, params.filename), params.content, 'utf-8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Write failed' }
    }
  })

  // ── Auto-updater IPC ─────────────────────────────────────
  ipcMain.handle('start-update-download', () => {
    void autoUpdater.downloadUpdate()
  })

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('check-for-updates-manual', () => {
    if (app.isPackaged) {
      void autoUpdater.checkForUpdates()
    }
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
