import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

interface TrayHandlers {
  onOpenMainWindow: () => void
  onCaptureNow: () => void
}

function createTrayIcon() {
  const iconPaths = [
    join(process.resourcesPath, 'iconTemplate.png'),
    join(process.resourcesPath, 'electron.icns')
  ]

  for (const iconPath of iconPaths) {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) {
      const resized = image.resize({ width: 18, height: 18 })
      if (process.platform === 'darwin') {
        resized.setTemplateImage(true)
      }
      return resized
    }
  }

  // Fallback 16x16 monochrome square if icon resources are unavailable.
  const fallback = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAIElEQVR4AWMYBaNgFIyCUTAKRsEoGAWjYBQw+P//PwCvxwQf9JDYTwAAAABJRU5ErkJggg=='
  )
  fallback.setTemplateImage(true)
  return fallback
}

export function createTray(handlers: TrayHandlers): Tray {
  if (tray) return tray

  tray = new Tray(createTrayIcon())
  tray.setToolTip('Detector')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Detector',
      click: handlers.onOpenMainWindow
    },
    {
      label: 'Capture Now',
      click: handlers.onCaptureNow
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', handlers.onOpenMainWindow)
  tray.on('double-click', handlers.onCaptureNow)

  console.log('[Tray] Created')
  return tray
}
