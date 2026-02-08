import { useState, useEffect, useCallback } from 'react'
import { PanelState } from '@/lib/types'

export function usePanel() {
  const [state, setState] = useState<PanelState>({ status: 'hidden' })

  useEffect(() => {
    const cleanups: Array<() => void> = []

    cleanups.push(
      window.electronAPI.onShowLoading(() => {
        console.log('[Panel] Show loading')
        setState({ status: 'loading' })
      })
    )

    cleanups.push(
      window.electronAPI.onShowResult((result) => {
        console.log('[Panel] Show result:', result.type)
        setState({ status: 'result', data: result })
      })
    )

    cleanups.push(
      window.electronAPI.onShowError((message) => {
        console.error('[Panel] Error:', message)
        setState({ status: 'error', message })
      })
    )

    window.electronAPI.panelReady()

    return () => cleanups.forEach((fn) => fn())
  }, [])

  const dismiss = useCallback(() => {
    setState({ status: 'hidden' })
    window.electronAPI.dismiss()
  }, [])

  const copyToClipboard = useCallback(
    (text: string) => {
      window.electronAPI.clipboardWrite(text)
      dismiss()
    },
    [dismiss]
  )

  return { state, dismiss, copyToClipboard }
}
