import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { PanelState } from '@/lib/types'
import { LoadingState } from './LoadingState'
import { EmailReply } from './EmailReply'
import { PageSummary } from './PageSummary'
import { CaptureAnalysis } from './CaptureAnalysis'
import { AlertTriangle } from 'lucide-react'

interface Props {
  state: PanelState
  onDismiss: () => void
  onCopy: (text: string) => void
}

export function Panel({ state, onDismiss, onCopy }: Props) {
  const isVisible = state.status !== 'hidden'

  // Esc to dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onDismiss])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full h-full p-3"
        >
          <div className="rounded-2xl bg-[hsl(var(--card))]/80 backdrop-blur-xl border border-white/10 shadow-2xl p-3 h-full flex flex-col overflow-hidden">
            {state.status === 'loading' && <LoadingState />}

            {state.status === 'result' && state.data.type === 'email-reply' && (
              <EmailReply data={state.data} onCopy={onCopy} onDismiss={onDismiss} />
            )}

            {state.status === 'result' && state.data.type === 'page-summary' && (
              <PageSummary data={state.data} onCopy={onCopy} onDismiss={onDismiss} />
            )}

            {state.status === 'result' && state.data.type === 'capture-analysis' && (
              <CaptureAnalysis data={state.data} onCopy={onCopy} onDismiss={onDismiss} />
            )}

            {state.status === 'error' && (
              <div className="flex flex-col items-center gap-3 py-6">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <p className="text-sm text-muted-foreground text-center">{state.message}</p>
                <button
                  onClick={onDismiss}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
