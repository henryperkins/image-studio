export type PlaybookTarget = 'image-generate' | 'image-edit' | 'video-sora'

export interface Playbook {
  id: string
  title: string
  summary: string
  target: PlaybookTarget
  recommended: {
    prompt: string
    size?: 'auto' | '1024x1024' | '1536x1024' | '1024x1536'
    format?: 'png' | 'jpeg' | 'webp'
    background?: 'transparent' | 'opaque' | 'auto'
    quality?: 'auto' | 'low' | 'medium' | 'high' | 'standard'
    brush?: number
    sora?: { width: number; height: number; seconds: number }
  }
  tips: string[]
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'logo-cleanup',
    title: 'Logo Cleanup',
    summary: 'Fix jagged edges, remove artifacts, export on transparent background.',
    target: 'image-edit',
    recommended: {
      prompt: 'Clean up the logo edges, remove aliasing and artifacts, smooth curves, preserve exact brand colors. Keep transparent background. Do not change proportions.',
      size: 'auto',
      format: 'png',
      background: 'transparent',
      quality: 'high',
      brush: 40
    },
    tips: [
      'Paint only over areas that need cleanup; red overlay shows the mask.',
      'Use PNG with transparent background for export.',
      'Leave prompt empty to apply global cleanup without a mask.'
    ]
  },
  {
    id: 'product-glamor-shot',
    title: 'Product Glamor Shot',
    summary: 'Remove background, relight, add subtle studio reflections.',
    target: 'image-edit',
    recommended: {
      prompt: 'Remove background and place the product on a clean studio backdrop with soft gradient lighting and subtle floor reflection. Keep product color accurate, enhance detail and contrast without oversaturation.',
      size: '1024x1024',
      format: 'png',
      background: 'transparent',
      quality: 'high',
      brush: 60
    },
    tips: [
      'Mask around the product edges; leave background unpainted to replace it.',
      'Transparent export lets you composite later; switch to WEBP/JPEG if needed.'
    ]
  },
  {
    id: 'storyboard-animatic',
    title: 'Storyboard Animatic',
    summary: 'Turn selected frames into a short Sora animatic.',
    target: 'video-sora',
    recommended: {
      prompt: 'Create a smooth storyboard animatic from the reference frames with gentle camera moves (pan/zoom), consistent lighting, and simple transitions. Maintain composition and pacing; no new objects.',
      sora: { width: 1024, height: 576, seconds: 6 }
    },
    tips: [
      'Select 3–8 images in order; use Use in Sora to prefill.',
      'Keep prompts concise; add scene notes like timing and camera moves.'
    ]
  }
]

