import { app, nativeImage } from 'electron'
import { dirname, extname, join, normalize, relative, resolve, sep } from 'path'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import type { HistoryRecord, ScreenCapture, ScreenshotAsset } from '@shared/types'

const SCREENSHOT_JPEG_QUALITY = 72
const SCREENSHOT_MAX_EDGE = 1600

function toPosixPath(path: string): string {
  return path.split(sep).join('/')
}

function isInsideRoot(path: string, root: string): boolean {
  const normalizedRoot = normalize(root)
  const normalizedPath = normalize(path)
  if (normalizedPath === normalizedRoot) return true
  return normalizedPath.startsWith(`${normalizedRoot}${sep}`)
}

function writeFileAtomic(targetPath: string, bytes: Buffer): void {
  const dir = dirname(targetPath)
  mkdirSync(dir, { recursive: true })

  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  writeFileSync(tmpPath, bytes)
  renameSync(tmpPath, targetPath)
}

export function getCaptureRootDir(): string {
  return join(app.getPath('userData'), 'captures')
}

export function getCaptureDirForRecord(recordId: number): string {
  return join(getCaptureRootDir(), String(Math.max(1, Math.floor(recordId))))
}

export function persistCaptureScreenshots(recordId: number, captures: ScreenCapture[]): ScreenshotAsset[] {
  if (!Number.isFinite(recordId) || recordId <= 0) return []
  if (!Array.isArray(captures) || captures.length === 0) return []

  const userDataRoot = app.getPath('userData')
  const captureDir = getCaptureDirForRecord(recordId)
  mkdirSync(captureDir, { recursive: true })

  const assets: ScreenshotAsset[] = []

  for (let i = 0; i < captures.length; i += 1) {
    const capture = captures[i]
    if (!capture || typeof capture.base64 !== 'string' || capture.base64.length === 0) continue

    try {
      const sourceBuffer = Buffer.from(capture.base64, 'base64')
      const sourceImage = nativeImage.createFromBuffer(sourceBuffer)
      const sourceSize = sourceImage.getSize()
      if (!sourceSize || sourceSize.width <= 0 || sourceSize.height <= 0) continue

      const scale = Math.min(1, SCREENSHOT_MAX_EDGE / Math.max(sourceSize.width, sourceSize.height))
      const targetWidth = Math.max(1, Math.round(sourceSize.width * scale))
      const targetHeight = Math.max(1, Math.round(sourceSize.height * scale))

      const resized =
        scale < 1
          ? sourceImage.resize({ width: targetWidth, height: targetHeight, quality: 'best' })
          : sourceImage

      const jpegBuffer = resized.toJPEG(SCREENSHOT_JPEG_QUALITY)
      const fileName = `display-${i + 1}.jpg`
      const absolutePath = join(captureDir, fileName)
      writeFileAtomic(absolutePath, jpegBuffer)

      const rel = toPosixPath(relative(userDataRoot, absolutePath))
      assets.push({
        displayId: capture.displayId || `display-${i + 1}`,
        relativePath: rel,
        width: targetWidth,
        height: targetHeight,
        bytes: jpegBuffer.length,
        mime: 'image/jpeg'
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`[CaptureStorage] Failed to persist screenshot #${i + 1}: ${reason}`)
    }
  }

  return assets
}

export function readCaptureImageData(relativePathInput: string): { ok: boolean; dataUrl?: string; bytes?: number; path?: string; message?: string } {
  const relativePath = String(relativePathInput || '').trim()
  if (!relativePath) return { ok: false, message: 'Empty image path' }

  const userDataRoot = app.getPath('userData')
  const absolutePath = resolve(userDataRoot, relativePath)
  if (!isInsideRoot(absolutePath, userDataRoot)) {
    return { ok: false, message: 'Path is outside userData root' }
  }

  try {
    if (!existsSync(absolutePath)) {
      return { ok: false, path: absolutePath, message: 'File not found' }
    }

    const stat = statSync(absolutePath)
    if (!stat.isFile()) {
      return { ok: false, path: absolutePath, message: 'Path is not a file' }
    }

    const bytes = readFileSync(absolutePath)
    const extension = extname(absolutePath).toLowerCase()
    const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'
    const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`

    return { ok: true, dataUrl, bytes: bytes.length, path: absolutePath }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, path: absolutePath, message: reason }
  }
}

export function deleteCaptureAssetsForRecord(record: HistoryRecord): { deletedFiles: number; deletedDirs: number } {
  const userDataRoot = app.getPath('userData')
  const captureRoot = getCaptureRootDir()

  let deletedFiles = 0
  let deletedDirs = 0
  const candidateDirs = new Set<string>()

  if (Array.isArray(record.screenshots)) {
    for (const asset of record.screenshots) {
      if (!asset || typeof asset.relativePath !== 'string' || asset.relativePath.trim().length === 0) continue
      const absolutePath = resolve(userDataRoot, asset.relativePath)
      if (!isInsideRoot(absolutePath, captureRoot)) continue

      try {
        if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
          rmSync(absolutePath, { force: true })
          deletedFiles += 1
        }
      } catch {
        // ignore file deletion failure
      }

      candidateDirs.add(dirname(absolutePath))
    }
  }

  if (typeof record.id === 'number' && Number.isFinite(record.id)) {
    candidateDirs.add(getCaptureDirForRecord(record.id))
  }

  const sortedDirs = Array.from(candidateDirs).sort((a, b) => b.length - a.length)
  for (const dir of sortedDirs) {
    if (!isInsideRoot(dir, captureRoot) || normalize(dir) === normalize(captureRoot)) continue
    try {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
        deletedDirs += 1
      }
    } catch {
      // ignore directory deletion failure
    }
  }

  return { deletedFiles, deletedDirs }
}
