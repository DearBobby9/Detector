import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

interface TrayHandlers {
  onOpenMainWindow: () => void
  onCaptureNow: () => void
}

function createTrayIcon() {
  const iconSources = [
    { path: join(process.resourcesPath, 'iconTemplate.png'), template: false },
    { path: join(process.resourcesPath, 'icon.icns'), template: false }
  ]

  for (const source of iconSources) {
    const image = nativeImage.createFromPath(source.path)
    if (!image.isEmpty()) {
      const resized = image.resize({ width: 18, height: 18 })
      if (process.platform === 'darwin' && source.template) {
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
