/**
 * Azure OpenAI Image Edit (Inpainting) quick test
 * ENV: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY or AZURE_OPENAI_AUTH_TOKEN, AZURE_OPENAI_IMAGE_DEPLOYMENT
 * Usage: pnpm --filter ai-media-studio-server exec tsx server/test-azure-image-edit.ts input.png mask.png "Replace the sky with dramatic storm clouds"
 */
import { editImage } from './src/lib/azure-image-edit.js'

const [imagePath, maskPath, ...rest] = process.argv.slice(2)
const prompt = rest.join(' ') || 'Replace the sky with dramatic storm clouds'

const endpoint = process.env.AZURE_OPENAI_ENDPOINT || ''
const apiKey = process.env.AZURE_OPENAI_API_KEY
const token = process.env.AZURE_OPENAI_AUTH_TOKEN
const model = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || 'gpt-image-1'

if (!endpoint) {
  console.error('AZURE_OPENAI_ENDPOINT not set.');
  process.exit(1)
}
if (!apiKey && !token) {
  console.error('Set AZURE_OPENAI_API_KEY or AZURE_OPENAI_AUTH_TOKEN.');
  process.exit(1)
}
if (!imagePath) {
  console.error('Usage: tsx server/test-azure-image-edit.ts <input.png|jpg> [mask.png] [prompt...]')
  process.exit(1)
}

const size = (process.env.AZURE_OPENAI_IMAGE_SIZE as any) || '1024x1024'

editImage({ endpoint, apiKey, token, model, prompt, imagePath, maskPath, size, background: 'transparent', output_format: 'png' })
  .then(r => console.log(`✅ Wrote ${r.outPath}`))
  .catch(e => { console.error('❌', e.message); process.exit(1) })

