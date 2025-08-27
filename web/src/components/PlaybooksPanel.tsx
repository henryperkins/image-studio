import { useEffect, useState } from 'react'
import { listPlaybooks, type Playbook } from '@/lib/api'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'

type Props = {
  selectedImageId?: string | null
  onSetPrompt: (text: string) => void
  onOpenEditor: (imageId: string) => void
  onGoToSora: () => void
}

export default function PlaybooksPanel({ selectedImageId, onSetPrompt, onOpenEditor, onGoToSora }: Props) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => { listPlaybooks().then(setPlaybooks).catch(()=>{}) }, [])

  const pb = playbooks.find(p => p.id === active) || playbooks[0]

  function apply(pb: Playbook) {
    if (pb.target === 'image-generate') {
      // Prefill prompt and creator settings via localStorage
      try {
        localStorage.setItem('IMG_CREATOR_SETTINGS', JSON.stringify({
          size: pb.recommended.size || 'auto',
          quality: pb.recommended.quality || 'high',
          format: pb.recommended.format || 'png',
          background: pb.recommended.background || 'auto',
          outputCompression: 100
        }))
      } catch {}
      onSetPrompt(pb.recommended.prompt)
    } else if (pb.target === 'image-edit') {
      if (!selectedImageId) {
        alert('Select an image from the library, then click "Open Editor" on it. The playbook defaults will be applied automatically.')
        // Stash editor preset for next open
        try { localStorage.setItem('IMAGE_EDITOR_PRESET', JSON.stringify(pb.recommended)) } catch {}
        return
      }
      try { localStorage.setItem('IMAGE_EDITOR_PRESET', JSON.stringify(pb.recommended)) } catch {}
      onOpenEditor(selectedImageId)
    } else if (pb.target === 'video-sora') {
      onSetPrompt(pb.recommended.prompt)
      onGoToSora()
    }
  }

  if (!pb) return null

  return (
    <Card className="p-4 mb-4 bg-neutral-800/60 border-neutral-700">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {playbooks.map(p => (
            <Button key={p.id} size="sm" variant={pb.id===p.id? 'default':'outline'} onClick={() => setActive(p.id)}>
              {p.title}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => apply(pb)}>Use Playbook</Button>
      </div>
      <div className="mt-3 grid md:grid-cols-3 gap-3">
        <div className="md:col-span-2 space-y-2">
          <Label className="text-neutral-300">Suggested Prompt</Label>
          <Textarea value={pb.recommended.prompt} onChange={()=>{}} readOnly className="min-h-[100px] bg-neutral-900/70" />
        </div>
        <div className="space-y-1 text-sm text-neutral-300">
          <div className="font-medium">Tips</div>
          <ul className="list-disc pl-4 space-y-1 text-neutral-400">
            {pb.tips.map((t, i) => (<li key={i}>{t}</li>))}
          </ul>
          <div className="mt-2 text-xs text-neutral-500">Expert controls remain visible; playbooks only prefill defaults.</div>
        </div>
      </div>
    </Card>
  )
}

