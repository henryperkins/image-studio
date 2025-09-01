import { Suspense } from 'react'
import SoraCreator from '@/components/SoraCreator'

type Props = {
  selectedIds: string[]
  selectedUrls: string[]
  onRemoveImage: (id: string) => void
  prompt: string
  setPrompt: React.Dispatch<React.SetStateAction<string>>
  promptInputRef?: React.RefObject<HTMLTextAreaElement | null>
}

export default function SoraPage({
  selectedIds,
  selectedUrls,
  onRemoveImage,
  prompt,
  setPrompt,
  promptInputRef
}: Props) {
  return (
    <Suspense fallback={null}>
      <SoraCreator
        selectedIds={selectedIds}
        selectedUrls={selectedUrls}
        onRemoveImage={onRemoveImage}
        prompt={prompt}
        setPrompt={setPrompt}
        promptInputRef={promptInputRef}
      />
    </Suspense>
  )
}

