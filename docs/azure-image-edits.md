Azure Image Edit (Inpainting)

- Endpoint: `POST {endpoint}/openai/v1/images/edits?api-version=preview`
- Fields: `image` (file), `mask?` (PNG, same dims), `model` (deployment name), `prompt`, plus `size`, `background`, `output_format`, `quality`, `output_compression`.
- Models: Use `gpt-image-1` for edits/inpainting. DALL·E 3 supports generations only in Azure.
- Responses: `gpt-image-1` returns base64 (`data[0].b64_json`).

Minimal cURL

```
curl -s -X POST "$AZURE_OPENAI_ENDPOINT/openai/v1/images/edits?api-version=preview" \
  -H "api-key: $AZURE_OPENAI_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "model=$AZURE_OPENAI_IMAGE_DEPLOYMENT" \
  -F "image=@input.png" \
  -F "mask=@mask.png" \
  -F 'prompt=Replace the sky with dramatic storm clouds' \
  -F "size=1024x1024" \
  -F "background=transparent" \
  -F "output_format=png"
```

Server API

- Route: `POST /api/images/edit` with body `{ image_id, prompt, mask_data_url?, size, output_format, background?, quality?, output_compression? }`.
- The server validates that mask is PNG and matches image dimensions before uploading to Azure.

Tiny TS Wrapper

- See `server/src/lib/azure-image-edit.ts` (used by `server/test-azure-image-edit.ts`). It validates mask dimensions and writes the decoded base64 to a file.

