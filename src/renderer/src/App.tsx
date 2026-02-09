import { Panel } from './components/Panel'
import { MainAppShell } from './components/MainAppShell'
import { usePanel } from './hooks/usePanel'

interface Props {
  view: 'panel' | 'app'
}

function App({ view }: Props) {
  if (view === 'app') {
    return <MainAppShell />
  }

  const { state, dismiss, copyToClipboard } = usePanel()

  return (
    <div className="w-full h-screen flex flex-col items-center">
      <Panel state={state} onDismiss={dismiss} onCopy={copyToClipboard} />
    </div>
  )
}

export default App
