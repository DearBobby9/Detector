import { Loader2 } from 'lucide-react'

export function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-1.5">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <p className="text-xs text-muted-foreground">Analyzing your screen...</p>
    </div>
  )
}
