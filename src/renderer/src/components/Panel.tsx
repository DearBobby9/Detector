import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react'
import { PanelState } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EmailReply } from './EmailReply'
import { PageSummary } from './PageSummary'
import { CaptureAnalysis } from './CaptureAnalysis'

interface Props {
  state: PanelState
  onDismiss: () => void
  onCopy: (text: string) => void
}

const COLLAPSE_DELAY_MS = 240

type OverlayMode = 'collapsed' | 'expanded' | 'detail'

export function Panel({ state, onDismiss, onCopy }: Props) {
  const isVisible = state.status !== 'hidden'
  const canExpand = state.status === 'result' || state.status === 'error'
  const isLoading = state.status === 'loading'
  const isError = state.status === 'error'

  const [overlayMode, setOverlayMode] = useState<OverlayMode>('collapsed')
  const [isExpandedContentVisible, setIsExpandedContentVisible] = useState(false)
  const [detailCloseSignal, setDetailCloseSignal] = useState(0)
  const isExpanded = overlayMode !== 'collapsed'
  const isDetailViewOpen = overlayMode === 'detail'

  const collapseTimerRef = useRef<number | null>(null)
  const overlayModeRef = useRef<OverlayMode>('collapsed')
  const canExpandRef = useRef(canExpand)

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current == null) return
    window.clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = null
  }, [])

  useEffect(() => {
    overlayModeRef.current = overlayMode
  }, [overlayMode])

  useEffect(() => {
    canExpandRef.current = canExpand
  }, [canExpand])

  const collapseToStrip = useCallback(() => {
    clearCollapseTimer()
    setIsExpandedContentVisible(false)
    setOverlayMode('collapsed')
    window.electronAPI.panelCollapse()
  }, [clearCollapseTimer])

  const scheduleCollapseToStrip = useCallback(() => {
    clearCollapseTimer()
    collapseTimerRef.current = window.setTimeout(() => {
      collapseTimerRef.current = null
      if (overlayModeRef.current !== 'expanded') return
      if (!canExpandRef.current) return
      collapseToStrip()
    }, COLLAPSE_DELAY_MS)
  }, [clearCollapseTimer, collapseToStrip])

  const expandToDrawer = useCallback(() => {
    clearCollapseTimer()
    if (!canExpandRef.current) return
    if (overlayModeRef.current === 'detail') return
    const wasCollapsed = overlayModeRef.current === 'collapsed'
    if (wasCollapsed) {
      setOverlayMode('expanded')
      window.electronAPI.panelExpand()
    }
    if (!wasCollapsed && isExpandedContentVisible) return
    setIsExpandedContentVisible(true)
  }, [clearCollapseTimer, isExpandedContentVisible])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (overlayModeRef.current === 'detail') {
        e.preventDefault()
        setDetailCloseSignal((value) => value + 1)
        return
      }
      onDismiss()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onDismiss])

  useEffect(() => {
    if (!isVisible) {
      clearCollapseTimer()
      setOverlayMode('collapsed')
      setIsExpandedContentVisible(false)
      return
    }

    if (isLoading) {
      collapseToStrip()
      return
    }

    if (canExpand && overlayModeRef.current === 'collapsed') {
      setIsExpandedContentVisible(false)
      window.electronAPI.panelCollapse()
    }
  }, [isVisible, isLoading, canExpand, clearCollapseTimer, collapseToStrip])

  useEffect(() => {
    return () => {
      clearCollapseTimer()
    }
  }, [clearCollapseTimer])

  const onDetailViewChange = useCallback(
    (isOpen: boolean) => {
      clearCollapseTimer()
      if (isOpen) {
        setOverlayMode('detail')
        setIsExpandedContentVisible(true)
        return
      }
      if (canExpandRef.current) {
        setOverlayMode('expanded')
        setIsExpandedContentVisible(true)
        return
      }
      collapseToStrip()
    },
    [clearCollapseTimer, collapseToStrip]
  )

  const statusText = isLoading ? 'Analyzing your screen...' : isError ? 'Analysis failed' : 'Analysis complete'

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -20, opacity: 0.8 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -18, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="h-full w-full p-0"
        >
          <div
            className="app-panel-shell app-nodrag h-full w-full overflow-hidden"
            data-expanded={isExpanded ? 'true' : 'false'}
            onMouseEnter={() => {
              expandToDrawer()
            }}
            onMouseLeave={() => {
              if (overlayModeRef.current !== 'expanded') return
              scheduleCollapseToStrip()
            }}
          >
            <div className="app-panel-header h-[42px] px-3 relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ui-text-muted)]" />
                ) : (
                  <CheckCircle2
                    className={cn(
                      'h-3.5 w-3.5',
                      isError ? 'text-[var(--ui-progress-danger)]' : 'text-[var(--ui-text-muted)]'
                    )}
                  />
                )}
              </div>

              <div className="absolute left-1/2 top-1/2 w-[62%] -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="min-w-0 text-[12px] font-semibold text-[var(--ui-text-muted)] truncate">
                  {statusText}
                </div>
              </div>

              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2.5">
                {canExpand && (
                  <div className="text-[11px] text-[var(--ui-text-soft)] hidden sm:block whitespace-nowrap">
                    {isDetailViewOpen
                      ? 'Press Esc to exit detail'
                      : isExpanded
                        ? 'Move out to collapse'
                        : 'Hover to expand'}
                  </div>
                )}
                {!isLoading && (
                  <button
                    onClick={onDismiss}
                    className={cn(
                      'app-nodrag h-6 w-6 rounded-lg text-[var(--ui-text-soft)] hover:text-[var(--ui-text)]',
                      'hover:bg-white/10 transition'
                    )}
                    aria-label="Close panel"
                  >
                    <X className="h-3.5 w-3.5 mx-auto" />
                  </button>
                )}
              </div>
            </div>

            <div data-visible={isExpandedContentVisible ? 'true' : 'false'} className="app-panel-body">
              <div className="h-full min-h-0 overflow-hidden">
                <div className="h-full p-2.5 min-h-0">
                  {state.status === 'result' && state.data.type === 'email-reply' && (
                    <EmailReply data={state.data} onCopy={onCopy} />
                  )}

                  {state.status === 'result' && state.data.type === 'page-summary' && (
                    <PageSummary data={state.data} onCopy={onCopy} />
                  )}

                  {state.status === 'result' && state.data.type === 'capture-analysis' && (
                    <CaptureAnalysis
                      data={state.data}
                      onCopy={onCopy}
                      onDetailViewChange={onDetailViewChange}
                      detailCloseSignal={detailCloseSignal}
                    />
                  )}

                  {state.status === 'error' && (
                    <div className="h-full flex flex-col items-center justify-center gap-3 py-6 text-center">
                      <AlertTriangle className="h-8 w-8 text-[var(--ui-progress-danger)]" />
                      <p className="text-sm text-[var(--ui-text-muted)]">{state.message}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="app-panel-hover-buffer" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
