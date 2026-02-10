import { FileText, Copy, X } from 'lucide-react'
import type { PageSummaryResult } from '@shared/types'

interface Props {
  data: PageSummaryResult
  onCopy: (text: string) => void
  onDismiss: () => void
}

export function PageSummary({ data, onCopy, onDismiss }: Props) {
  const fullText = [data.title, '', data.summary, '', ...data.keyPoints.map((p) => `• ${p}`)].join(
    '\n'
  )

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-medium text-muted-foreground">Page Summary</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-md hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-3">
        <div className="text-sm font-medium">{data.title}</div>

        <div className="text-sm text-muted-foreground leading-relaxed">{data.summary}</div>

        {data.keyPoints.length > 0 && (
          <ul className="space-y-1.5">
            {data.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-muted-foreground shrink-0">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={() => onCopy(fullText)}
        className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
      >
        <Copy className="h-4 w-4" />
        Copy Summary
      </button>
    </div>
  )
}
