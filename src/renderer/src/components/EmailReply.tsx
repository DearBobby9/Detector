import { Mail, Copy, X } from 'lucide-react'
import type { EmailReplyResult } from '@shared/types'

interface Props {
  data: EmailReplyResult
  onCopy: (text: string) => void
  onDismiss: () => void
}

export function EmailReply({ data, onCopy, onDismiss }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-blue-400" />
          <span className="text-xs font-medium text-muted-foreground">Email Reply Draft</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-md hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="text-xs text-muted-foreground">
        To: {data.originalSender}
      </div>

      <div className="text-sm font-medium">
        {data.subject}
      </div>

      <div className="bg-white/5 rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap max-h-[220px] overflow-y-auto">
        {data.draft}
      </div>

      <button
        onClick={() => onCopy(data.draft)}
        className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
      >
        <Copy className="h-4 w-4" />
        Copy Reply
      </button>
    </div>
  )
}
