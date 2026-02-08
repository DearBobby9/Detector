import { desktopCapturer, screen, systemPreferences } from 'electron'
import { ScreenCapture } from '@shared/types'

export async function captureAllScreens(): Promise<ScreenCapture[]> {
  const displays = screen.getAllDisplays()
  console.log('[Screenshot] Capturing', displays.length, 'display(s)')

  if (process.platform === 'darwin') {
    const mediaStatus = systemPreferences.getMediaAccessStatus('screen')
    if (mediaStatus === 'denied' || mediaStatus === 'restricted') {
      throw new Error(
        `Screen Recording permission is ${mediaStatus}. Enable Electron in System Settings > Privacy & Security > Screen & System Audio Recording.`
      )
    }
  }

  let sources
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    })
  } catch (error) {
    if (process.platform === 'darwin') {
      const mediaStatus = systemPreferences.getMediaAccessStatus('screen')
      throw new Error(
        `Failed to get screen sources (permission status: ${mediaStatus}). Enable Electron in System Settings > Privacy & Security > Screen & System Audio Recording.`
      )
    }

    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to get screen sources: ${message}`)
  }

  const captures: ScreenCapture[] = []

  for (const source of sources) {
    const thumbnail = source.thumbnail
    if (thumbnail.isEmpty()) {
      console.warn('[Screenshot] Empty thumbnail for source:', source.name)
      continue
    }

    // Convert to JPEG at 85% quality (much smaller than PNG)
    const jpegBuffer = thumbnail.toJPEG(85)
    const base64 = jpegBuffer.toString('base64')
    const size = thumbnail.getSize()

    captures.push({
      displayId: source.display_id || source.id,
      base64,
      width: size.width,
      height: size.height
    })

    console.log(
      '[Screenshot] Captured display:',
      source.name,
      `${size.width}x${size.height}`,
      `(${Math.round(jpegBuffer.length / 1024)}KB)`
    )
  }

  if (captures.length === 0) {
    throw new Error('No screens captured. Check Screen Recording permission in System Settings.')
  }

  return captures
}
