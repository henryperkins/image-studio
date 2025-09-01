import { Suspense } from 'react'
import PlaybooksPanel from '@/components/PlaybooksPanel'
import ImageCreator from '@/components/ImageCreator'

type Props = {
  prompt: string
  setPrompt: React.Dispatch<React.SetStateAction<string>>
  promptInputRef?: React.RefObject<HTMLTextAreaElement | null>
  selectedImageId?: string | null
  onOpenEditor: (id: string) => void
  onGoToSora: () => void
  onImagesSaved: (id: string) => Promise<void> | void
}

export default function ImagesPage({
  prompt,
  setPrompt,
  promptInputRef,
  selectedImageId,
  onOpenEditor,
  onGoToSora,
  onImagesSaved
}: Props) {
  return (
    <Suspense fallback={null}>
      <PlaybooksPanel
        selectedImageId={selectedImageId || null}
        onSetPrompt={setPrompt}
        onOpenEditor={onOpenEditor}
        onGoToSora={onGoToSora}
      />
      <ImageCreator
        onSaved={onImagesSaved}
        promptInputRef={promptInputRef}
        prompt={prompt}
        setPrompt={setPrompt}
      />
    </Suspense>
  )
}

