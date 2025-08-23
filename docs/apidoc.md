Here’s the reformatted and well-structured version of your note:

---

# **Azure OpenAI Image & Video API Reference**
*A focused guide to image and video-related API specs from [[Azure OpenAI in Azure AI Foundry Models REST API v1 preview reference - Azure OpenAI]]*

---

## **Scope & Basics**
- **Coverage**:
  - Images (generation, edits)
  - Image-related response objects & content filtering
  - Video generation jobs & content retrieval
  - Image generation via **Responses API** (tool-based)
- **Base Path**: `{endpoint}/openai/v1/...`
- **Versioning**: Append `?api-version=preview` to endpoints.
- **Authentication**:
  - `Authorization: Bearer <token>`
  - or `api-key: <your-aoai-key>`

---

## **1. Images – Generation**
### **Endpoint**
- **Method**: `POST`
- **URL**: `{endpoint}/openai/v1/images/generations?api-version=preview`
- **Headers**: `Content-Type: application/json`

### **Required Parameters**
| Parameter | Type     | Description                     |
|-----------|----------|---------------------------------|
| `model`   | string   | Your deployment name            |
| `prompt`  | string   | Text description of the image  |

### **Optional Parameters**
| Parameter            | Type    | Description                                                                                     | Supported Models               |
|----------------------|---------|-------------------------------------------------------------------------------------------------|-------------------------------|
| `n`                  | int     | Number of images (1–10; **DALL·E 3 supports only `n=1`**)                                       | All                           |
| `size`               | string  | Image dimensions (see [Model Constraints](#9-model-constraints))                              | All                           |
| `output_format`      | string  | `png` \| `jpeg` \| `webp` (GPT-Image-1 only)                                                   | GPT-Image-1                   |
| `output_compression` | int     | 0–100 (GPT-Image-1 with `webp`/`jpeg`; default: `100`)                                         | GPT-Image-1                   |
| `quality`            | string  | **GPT-Image-1**: `low` \| `medium` \| `high` \| `auto` (default) <br> **DALL·E 3**: `standard` \| `hd` <br> **DALL·E 2**: `standard` (only) | All                           |
| `moderation`         | string  | `low` \| `auto` (GPT-Image-1 only)                                                              | GPT-Image-1                   |
| `response_format`    | string  | `url` \| `b64_json` (**DALL·E 2/3 only**; GPT-Image-1 always returns `b64_json`)               | DALL·E 2/3                    |
| `style`              | string  | `vivid` \| `natural` (DALL·E 3 only)                                                            | DALL·E 3                      |
| `user`               | string  | End-user identifier                                                                             | All                           |

### **Response (200 OK)**
```json
{
  "data": [
    {
      "revised_prompt": "string (DALL·E 3 only)",
      "url": "string (DALL·E 2/3 if response_format=url)",
      "b64_json": "string (GPT-Image-1 or if response_format=b64_json)",
      "content_filter_results": {
        "hate": {"severity": "safe|low|medium|high", "filtered": bool},
        "self_harm": {...},
        "sexual": {...},
        "violence": {...}
      }
    }
  ],
  "prompt_filter_results": {
    "sexual": {"filtered": bool, "severity": "safe|high"},
    "violence": {...},
    "hate": {...},
    "self_harm": {...},
    "profanity": {...},
    "custom_blocklists": [...]
  },
  "content_filter_results": {...},
  "usage": {
    "input_tokens": int,
    "output_tokens": int,
    "total_tokens": int
  } // GPT-Image-1 only
}
```

### **Notes**
- **URL Expiry**: DALL·E 2/3 URLs expire after ~60 minutes.
- **Background Control**: Use **ImageGen Tool** in Responses API for advanced background settings (not exposed in `/generations`).

---

## **2. Images – Edits**
### **Endpoint**
- **Method**: `POST`
- **URL**: `{endpoint}/openai/v1/images/edits?api-version=preview`
- **Headers**: `Content-Type: multipart/form-data`

### **Required Parameters**
| Parameter | Type               | Description                          |
|-----------|--------------------|--------------------------------------|
| `image`   | file \| file[]     | Image(s) to edit                     |
| `prompt`  | string             | Edit instruction (e.g., "Make sky pink") |
| `model`   | string             | Your image deployment name          |

### **Optional Parameters**
| Parameter            | Type    | Description                                                                                     |
|----------------------|---------|-------------------------------------------------------------------------------------------------|
| `mask`               | file    | Transparent areas define editable regions                                                       |
| `n`                  | int     | Number of variants (1–10)                                                                       |
| `size`               | string  | Same as [Generation](#1-images-generation)                                                     |
| `output_format`      | string  | `png` \| `jpeg` \| `webp` (GPT-Image-1 only; default: `png`)                                     |
| `output_compression` | int     | 0–100 (GPT-Image-1 with `webp`/`jpeg`; default: `100`)                                         |
| `quality`            | string  | `standard` \| `low` \| `medium` \| `high` \| `auto` (GPT-Image-1) <br> DALL·E 2: `standard` only |
| `response_format`    | string  | `url` \| `b64_json` (DALL·E 2 only; GPT-Image-1 always returns `b64_json`)                     |
| `background`         | string  | `transparent` \| `opaque` \| `auto` (GPT-Image-1 only)                                          |
| `user`               | string  | End-user identifier                                                                             |

### **Response**
Same structure as [Generation](#1-images-generation) (`AzureImagesResponse`).

### **Notes**
- **Transparent Backgrounds**: Requires `output_format=png` or `webp`.
- **Multi-Image Edits**: Include all files and masks in the same `multipart/form-data` request.

---

## **3. Image Response Objects & Filtering**
### **Key Objects**
1. **`AzureImage`**
   - `revised_prompt` (DALL·E 3 only)
   - `url` (DALL·E 2/3) or `b64_json` (GPT-Image-1)
   - `content_filter_results`: Severity flags (`hate`, `self_harm`, `sexual`, `violence`)
   - `prompt_filter_results`: Categories (`sexual`, `violence`, `hate`, `self_harm`, `profanity`, `custom_blocklists`)

2. **`AzureImagesResponse`**
   - `created`: Timestamp
   - `data[]`: Array of `AzureImage`
   - `usage`: Token counts (GPT-Image-1 only)

---

## **4. Images via Responses API (Tool-Based)**
### **Use Case**
Integrate image generation into **unified Responses API** with tools and streaming.

### **Tool Definition**
```json
{
  "tools": [
    {
      "type": "image_generation",
      "parameters": {
        "background": "transparent",
        "model": "gpt-image-1",
        "moderation": "auto",
        "output_format": "png",
        "quality": "high",
        "size": "1024x1024",
        "partial_images": 3
      }
    }
  ]
}
```

### **Streaming Events**
- `response.image_generation_call.in_progress`
- `response.image_generation_call.generating`
- `response.image_generation_call.partial_image` (contains `partial_image_b64`)
- `response.image_generation_call.completed`

### **Output**
- **Tool Call Result**: Base64-encoded image in `ImageGenToolCallItemResource`.

---

## **5. Video – Generation Jobs**
### **Endpoints**
| Action       | Method | URL                                                                                     |
|--------------|--------|-----------------------------------------------------------------------------------------|
| **Create**   | POST   | `{endpoint}/openai/v1/video/generations/jobs?api-version=preview`                        |
| **List**     | GET    | `{endpoint}/openai/v1/video/generations/jobs?api-version=preview`                        |
| **Get Job**  | GET    | `{endpoint}/openai/v1/video/generations/jobs/{job-id}?api-version=preview`              |
| **Delete**   | DELETE | `{endpoint}/openai/v1/video/generations/jobs/{job-id}?api-version=preview` (Returns 204) |

### **Create Job (JSON Body)**
| Parameter      | Type    | Description                                                                                     |
|----------------|---------|-------------------------------------------------------------------------------------------------|
| `model`        | string  | **Required**: Your video deployment name                                                       |
| `prompt`       | string  | **Required**: Video description                                                                 |
| `width`        | int     | **Required**: 480–1920 (see [Supported Dimensions](#))                                          |
| `height`       | int     | **Required**: 480–1080                                                                          |
| `n_seconds`    | int     | Duration (1–20; default: 5)                                                                     |
| `n_variants`  | int     | Number of variants (1–5; fewer for larger dimensions)                                          |

### **Supported Dimensions**
- **Square**: 480×480, 720×720, 1080×1080
- **Landscape/Portrait**: 854×480, 1280×720, 1920×1080

### **Create with Media (Multipart/Form-Data)**
| Parameter       | Type     | Description                                                                                     |
|-----------------|----------|-------------------------------------------------------------------------------------------------|
| `files[]`       | file[]   | **Required**: Attached media files                                                              |
| `inpaint_items` | array    | Optional inpainting instructions (see [InpaintItem](#))                                        |

### **`InpaintItem` Structure**
```json
{
  "file_name": "string (must match attached file)",
  "frame_index": int,
  "crop_bounds": {
    "top": float (0–1),
    "left": float (0–1),
    "right": float (0–1),
    "bottom": float (0–1)
  }
}
```

### **Job Statuses**
`preprocessing` → `queued` → `running` → `processing` → `succeeded`/`failed`/`cancelled`

### **Error Response**
```json
{
  "error": {
    "code": "ResponsibleAIPolicyViolation",
    "inner_error": {
      "code": "string",
      "error_details": "string",
      "revised_prompt": "string"
    }
  }
}
```

---

## **6. Video – Retrieve Generated Content**
### **Endpoints**
| Action               | Method | URL                                                                                     | Response                     |
|----------------------|--------|-----------------------------------------------------------------------------------------|------------------------------|
| **Get Metadata**     | GET    | `{endpoint}/openai/v1/video/generations/{generation-id}?api-version=preview`          | `VideoGeneration` (JSON)     |
| **Get Thumbnail**    | GET    | `{endpoint}/openai/v1/video/generations/{generation-id}/content/thumbnail?api-version=preview` | Binary JPEG          |
| **Get Video**        | GET    | `{endpoint}/openai/v1/video/generations/{generation-id}/content/video?api-version=preview[&quality=high|low]` | Binary MP4           |
| **Check Readiness**  | HEAD   | `{endpoint}/openai/v1/video/generations/{generation-id}/content/video?api-version=preview[&quality=high|low]` | Headers only         |

---

## **7. Common Request Patterns**
### **Headers**
- **Authorization**: `Bearer <token>` or `api-key: <key>`
- **Content-Type**:
  - `application/json` (default)
  - `multipart/form-data` (for image edits/video with media)

### **Query Parameters**
- **Required**: `?api-version=preview`

### **Model Usage**
- Use your **Azure OpenAI deployment name** (not raw OpenAI model ID).

---

## **8. Quick API Examples**
### **Image Generation (DALL·E 3)**
```bash
curl -X POST "{endpoint}/openai/v1/images/generations?api-version=preview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3-deployment",
    "prompt": "A watercolor of mountains at sunrise, vivid style",
    "n": 1,
    "size": "1024x1024",
    "quality": "hd",
    "style": "vivid"
  }'
```

### **Image Edit (Transparent Background)**
```bash
curl -X POST "{endpoint}/openai/v1/images/edits?api-version=preview" \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@original.png" \
  -F "mask=@mask.png" \
  -F "prompt=Make the background transparent" \
  -F "model=gpt-image-1-deployment" \
  -F "output_format=png" \
  -F "background=transparent"
```

### **Video Job Creation**
```bash
curl -X POST "{endpoint}/openai/v1/video/generations/jobs?api-version=preview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "video-deployment",
    "prompt": "A red kite flying over green hills at sunset",
    "width": 1280,
    "height": 720,
    "n_seconds": 10,
    "n_variants": 1
  }'
```

### **Download Video**
```bash
curl -X GET "{endpoint}/openai/v1/video/generations/{generation-id}/content/video?api-version=preview&quality=high" \
  -H "Authorization: Bearer $TOKEN" \
  --output video.mp4
```

---

## **9. Model & Parameter Constraints**
| Model         | `n`  | `size` Options                                                                 | `response_format` | `quality`               | Notes                                  |
|---------------|------|--------------------------------------------------------------------------------|--------------------|--------------------------|----------------------------------------|
| **GPT-Image-1** | 1–10 | `auto` \| `1024x1024` \| `1536x1024` \| `1024x1536`                          | `b64_json` (only)  | `low`/`medium`/`high`/`auto` | Supports `background` in edits.       |
| **DALL·E 3**   | 1    | `1024x1024` \| `1792x1024` \| `1024x1792`                                   | `url` \| `b64_json` | `standard` \| `hd`      | `style`: `vivid` \| `natural`          |
| **DALL·E 2**   | 1–10 | `256x256` \| `512x512` \| `1024x1024`                                        | `url` \| `b64_json` | `standard` (only)       |                                        |

### **Edit-Specific Constraints**
- **GPT-Image-1**:
  - `background=transparent` requires `output_format=png` or `webp`.
  - `output_compression` applies only to `webp`/`jpeg`.

---

## **10. Content Filtering (Images)**
### **Prompt Filters**
- Categories: `sexual`, `violence`, `hate`, `self_harm`, `profanity`, `custom_blocklists`.
- Returned in `AzureContentFilterImagePromptResults`.

### **Output Filters**
- Categories: `hate`, `self_harm`, `sexual`, `violence`.
- Severity levels: `safe` \| `low` \| `medium` \| `high`.
- Returned in `AzureContentFilterImageResponseResults`.

---

## **11. Key Component Types**
| Category               | Components                                                                                     |
|------------------------|------------------------------------------------------------------------------------------------|
| **Images**             | `AzureImagesResponse`, `AzureImage`                                                            |
| **Image Filtering**    | `AzureContentFilterImagePromptResults`, `AzureContentFilterImageResponseResults`              |
| **Video**              | `VideoGenerationJob`, `VideoGeneration`, `JobStatus`, `Quality` (`high`/`low`)               |
| **Video Inpainting**   | `InpaintItem`, `CropBounds`                                                                     |
| **Errors**             | `AzureOpenAIVideoGenerationErrorResponse` (includes `inner_error` and `revised_prompt`)       |
| **Responses API**      | `ImageGenTool`, Streaming events (`response.image_generation_call.*`), `ImageGenToolCallItemResource` |

---

## **Need Ready-to-Run Snippets?**
I can generate **cURL** or **Postman** examples for:
- Image generation/edits (GPT-Image-1 vs. DALL·E-3).
- Video job creation, polling, and content download.

**Just share:**
1. Your **endpoint hostname** (e.g., `https://your-resource.openai.azure.com`).
2. **Deployment names** (e.g., `dall-e-3-deployment`, `video-deployment`).


---

Here are the same curl examples, organized and formatted for easy reading and copy/paste.

Variables and setup
- Replace the placeholder values with your own.
- Use either api-key or bearer token auth in each request.

```bash
# ------------ Variables ------------
ENDPOINT="https://your-resource.openai.azure.com"
API_VERSION="preview"

# Auth: use ONE of the two headers per request:
API_KEY="YOUR_AOAI_KEY"
TOKEN="YOUR_BEARER_TOKEN"

# Deployments
IMG_DEP_GPT_IMAGE_1="gpt-image-1-deployment"
IMG_DEP_DALLE3="dall-e-3-deployment"
VIDEO_DEP="video-deployment"

# Prompts and files
PROMPT_IMG_GPT="A modern isometric cityscape at dusk, neon accents"
PROMPT_IMG_DALLE3="A watercolor of mountains at sunrise, vivid style"
EDIT_PROMPT="Replace the sky with a pink gradient"
ORIGINAL_IMAGE="original.png"
MASK_IMAGE="mask.png"

# Outputs
OUT_GPT_IMAGE_1="gpt-image-1.png"
OUT_DALLE3_URL_FILE="dalle3-url.txt"
OUT_DALLE3_IMAGE="dalle3.png"
VIDEO_PROMPT="A red kite flying over green hills at sunset"
VIDEO_OUT="video.mp4"
VIDEO_THUMB="thumb.jpg"
```

1) Image generation — gpt-image-1 (base64 to PNG)
```bash
curl -s -X POST "$ENDPOINT/openai/v1/images/generations?api-version=$API_VERSION" \
  -H "Content-Type: application/json" \
  -H "api-key: $API_KEY" \
  -d "{
    \"model\": \"$IMG_DEP_GPT_IMAGE_1\",
    \"prompt\": \"$PROMPT_IMG_GPT\",
    \"size\": \"1024x1024\",
    \"output_format\": \"png\",
    \"quality\": \"high\",
    \"moderation\": \"auto\"
  }" \
| jq -r '.data[0].b64_json' | base64 --decode > "$OUT_GPT_IMAGE_1"

# Alternative auth header:
# -H "Authorization: Bearer $TOKEN"
```

2) Image generation — DALL·E 3 (URL → download)
```bash
# Request generation (n=1 for DALL·E 3) and capture the URL
curl -s -X POST "$ENDPOINT/openai/v1/images/generations?api-version=$API_VERSION" \
  -H "Content-Type: application/json" \
  -H "api-key: $API_KEY" \
  -d "{
    \"model\": \"$IMG_DEP_DALLE3\",
    \"prompt\": \"$PROMPT_IMG_DALLE3\",
    \"n\": 1,
    \"size\": \"1024x1024\",
    \"quality\": \"hd\",
    \"style\": \"vivid\",
    \"response_format\": \"url\"
  }" \
| jq -r '.data[0].url' > "$OUT_DALLE3_URL_FILE"

# Download the image (URL expires in ~60 minutes)
curl -s -L "$(cat "$OUT_DALLE3_URL_FILE")" -o "$OUT_DALLE3_IMAGE"
```

3) Image edit — gpt-image-1 with transparent background
```bash
curl -s -X POST "$ENDPOINT/openai/v1/images/edits?api-version=$API_VERSION" \
  -H "api-key: $API_KEY" \
  -F "model=$IMG_DEP_GPT_IMAGE_1" \
  -F "prompt=$EDIT_PROMPT" \
  -F "image=@$ORIGINAL_IMAGE" \
  -F "mask=@$MASK_IMAGE" \
  -F "output_format=png" \
  -F "background=transparent" \
| jq -r '.data[0].b64_json' | base64 --decode > edited-transparent.png
```

4) Video generation job — create (JSON)
```bash
curl -s -X POST "$ENDPOINT/openai/v1/video/generations/jobs?api-version=$API_VERSION" \
  -H "Content-Type: application/json" \
  -H "api-key: $API_KEY" \
  -d "{
    \"model\": \"$VIDEO_DEP\",
    \"prompt\": \"$VIDEO_PROMPT\",
    \"width\": 1280,
    \"height\": 720,
    \"n_seconds\": 10,
    \"n_variants\": 1
  }" \
| tee create_job.json

# Extract job_id
JOB_ID=$(jq -r '.id' create_job.json)
echo "JOB_ID=$JOB_ID"
```

5) Video jobs — list and get job status
```bash
# List jobs
curl -s -X GET "$ENDPOINT/openai/v1/video/generations/jobs?api-version=$API_VERSION" \
  -H "api-key: $API_KEY" \
| jq '.'

# Get this job
curl -s -X GET "$ENDPOINT/openai/v1/video/generations/jobs/$JOB_ID?api-version=$API_VERSION" \
  -H "api-key: $API_KEY" \
| tee get_job.json

# Possible statuses: preprocessing | queued | running | processing | succeeded | failed | cancelled
```

6) Poll until job succeeds; capture generation id
```bash
while true; do
  STATUS=$(curl -s -X GET "$ENDPOINT/openai/v1/video/generations/jobs/$JOB_ID?api-version=$API_VERSION" \
    -H "api-key: $API_KEY" | jq -r '.status')
  echo "Status: $STATUS"
  if [ "$STATUS" = "succeeded" ]; then
    break
  elif [ "$STATUS" = "failed" ] || [ "$STATUS" = "cancelled" ]; then
    echo "Job ended with status: $STATUS" >&2
    exit 1
  fi
  sleep 5
done

# Get the first generation id
GEN_ID=$(curl -s -X GET "$ENDPOINT/openai/v1/video/generations/jobs/$JOB_ID?api-version=$API_VERSION" \
  -H "api-key: $API_KEY" | jq -r '.generations[0].id')
echo "GEN_ID=$GEN_ID"
```

7) Retrieve metadata, thumbnail, and video
```bash
# Metadata
curl -s -X GET "$ENDPOINT/openai/v1/video/generations/$GEN_ID?api-version=$API_VERSION" \
  -H "api-key: $API_KEY" \
| jq '.'

# Thumbnail (JPEG)
curl -s -X GET "$ENDPOINT/openai/v1/video/generations/$GEN_ID/content/thumbnail?api-version=$API_VERSION" \
  -H "api-key: $API_KEY" \
  -o "$VIDEO_THUMB"

# Video (MP4), high quality
curl -s -X GET "$ENDPOINT/openai/v1/video/generations/$GEN_ID/content/video?api-version=$API_VERSION&quality=high" \
  -H "api-key: $API_KEY" \
  -o "$VIDEO_OUT"

# Optional: HEAD to check readiness/headers
curl -I -X HEAD "$ENDPOINT/openai/v1/video/generations/$GEN_ID/content/video?api-version=$API_VERSION&quality=high" \
  -H "api-key: $API_KEY"
```

8) Delete job (cleanup)
```bash
curl -i -X DELETE "$ENDPOINT/openai/v1/video/generations/jobs/$JOB_ID?api-version=$API_VERSION" \
  -H "api-key: $API_KEY"
```

Notes
- Swap the auth header to Authorization: Bearer $TOKEN if you prefer bearer tokens.
- gpt-image-1 always returns base64; the jq | base64 pipeline writes the image to disk.
- DALL·E 3 URL links expire after ~60 minutes.
- For transparent backgrounds with gpt-image-1 edits, use output_format=png or webp.

