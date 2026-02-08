import { Panel } from './components/Panel'
import { usePanel } from './hooks/usePanel'

function App() {
  const { state, dismiss, copyToClipboard } = usePanel()

  return (
    <div className="w-full h-screen flex flex-col items-center">
      <Panel state={state} onDismiss={dismiss} onCopy={copyToClipboard} />
    </div>
  )
}

export default App
