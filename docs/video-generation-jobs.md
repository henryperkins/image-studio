# Video Generation Job Creation Guide

## Video Generation Jobs - Create

**HTTP Request**

```http
POST {endpoint}/openai/v1/video/generations/jobs?api-version=preview
```

**Purpose**  
Creates a new video generation job.

### URI Parameters

| Name | In | Required | Type | Description |
|------|----|----------|------|-------------|
| `endpoint` | path | Yes | string (url) | Azure OpenAI endpoint (e.g., `https://{your-resource-name}.openai.azure.com`). |
| `api-version` | query | No | string | API version (default: `v1`). |

### Request Headers

Authentication (use either token-based **or** API-key):

| Name | Required | Type | Description |
|------|----------|------|-------------|
| `Authorization` | Yes | string | `Bearer {Azure_OpenAI_Auth_Token}` (OAuth2). |
| `api-key` | Yes | string | Azure OpenAI API key. |

### Request Body (`application/json`)

| Name | Type | Description | Required | Default |
|------|------|-------------|----------|---------|
| `height` | integer | Video height (supported: 480, 854, 720, 1280, 1080, 1920 in landscape/portrait). | Yes | - |
| `model` | string | Deployment name for the request. | Yes | - |
| `n_seconds` | integer | Video duration (1-20 seconds). | No | 5 |
| `n_variants` | integer | Number of video variants (1-5). Smaller dimensions allow more variants. | No | 1 |
| `prompt` | string | Prompt for video generation. | Yes | - |
| `width` | integer | Video width (supported dimensions same as height). | Yes | - |

### Request Body (`multipart/form-data`)

| Name | Type | Description | Required | Default |
|------|------|-------------|----------|---------|
| `files` | array | - | Yes | - |
| `height` | integer | Same as above. | Yes | - |
| `inpaint_items` | array | Optional inpainting items. | No | - |
| `model` | string | Same as above. | Yes | - |
| `n_seconds` | integer | Same as above. | No | 5 |
| `n_variants` | integer | Same as above. | No | 1 |
| `prompt` | string | Same as above. | Yes | - |
| `width` | integer | Same as above. | Yes | - |

### Responses

| Status Code | Content-Type | Type | Description |
|-------------|--------------|------|-------------|
| 200 | `application/json` | `VideoGenerationJob` | Request succeeded. |
| default | `application/json` | `AzureOpenAIVideoGenerationErrorResponse` | Unexpected error. |

---

## Video Generation Jobs - List

**HTTP Request**

```http
GET {endpoint}/openai/v1/video/generations/jobs?api-version=preview
```

**Purpose**  
Lists video generation jobs.

### URI Parameters

| Name | In | Required | Type | Description |
|------|----|----------|------|-------------|
| `endpoint` | path | Yes | string (url) | Azure OpenAI endpoint (same as above). |
| `api-version` | query | No | string | API version (default: `v1`). |
| `before` | query | No | string | - |
| `after` | query | No | string | - |
| `limit` | query | Yes | integer | - |
| `statuses` | query | No | array | - |

### Request Headers

Same as **Create** section.

### Responses

| Status Code | Content-Type | Type | Description |
|-------------|--------------|------|-------------|
| 200 | `application/json` | `VideoGenerationJobList` | Request succeeded. |
| default | `application/json` | `AzureOpenAIVideoGenerationErrorResponse` | Unexpected error. |

---

## Video Generation Jobs - Get

**HTTP Request**

```http
GET {endpoint}/openai/v1/video/generations/jobs/{job-id}?api-version=preview
```

**Purpose**  
Retrieves properties of a video generation job.

### URI Parameters

| Name | In | Required | Type | Description |
|------|----|----------|------|-------------|
| `endpoint` | path | Yes | string (url) | Azure OpenAI endpoint (same as above). |
| `api-version` | query | No | string | API version (default: `v1`). |
| `job-id` | path | Yes | string | ID of the video generation job. |

### Request Headers

Same as **Create** section.

### Responses

| Status Code | Content-Type | Type | Description |
|-------------|--------------|------|-------------|
| 200 | `application/json` | `VideoGenerationJob` | Request succeeded. |
| default | `application/json` | `AzureOpenAIVideoGenerationErrorResponse` | Unexpected error. |

---

## Video Generation Jobs - Delete

**HTTP Request**

```http
DELETE {endpoint}/openai/v1/video/generations/jobs/{job-id}?api-version=preview
```

**Purpose**  
Deletes a video generation job.

### URI Parameters

Same as **Get** section.

### Request Headers

Same as **Create** section.

### Responses

| Status Code | Content-Type | Type | Description |
|-------------|--------------|------|-------------|
| 204 | - | - | No content (headers only). |
| default | `application/json` | `AzureOpenAIVideoGenerationErrorResponse` | Unexpected error. |

---

## Video Generations - Get

**HTTP Request**

```http
GET {endpoint}/openai/v1/video/generations/{generation-id}?api-version=preview
```

**Purpose**  
Retrieves a video generation by ID.

### URI Parameters

| Name | In | Required | Type | Description |
|------|----|----------|------|-------------|
| `endpoint` | path | Yes | string (url) | Azure OpenAI endpoint (same as above). |
| `api-version` | query | No | string | API version (default: `v1`). |
| `generation-id` | path | Yes | string | ID of the video generation. |

### Request Headers

Same as **Create** section.

### Responses

| Status Code | Content-Type | Type | Description |
|-------------|--------------|------|-------------|
| 200 | `application/json` | `VideoGeneration` | Request succeeded. |
| default | `application/json` | `AzureOpenAIVideoGenerationErrorResponse` | Unexpected error. |

---

## Video Generations - Retrieve Thumbnail

**HTTP Request**

```http
GET {endpoint}/openai/v1/video/generations/{generation-id}/content/thumbnail?api-version=preview
```

**Purpose**  
Retrieves a thumbnail of the generated video content.

### URI Parameters

Same as **Get** section.

### Request Headers

Same as **Create** section.

### Responses

| Status Code | Content-Type | Type | Description |
|-------------|--------------|------|-------------|
| 200 | `image/jpg` | string | Request succeeded. |
| default | `application/json` | `AzureOpenAIVideoGenerationErrorResponse` | Unexpected error. |

---

## Video Generations - Retrieve Video Content

**HTTP Request**

```http
GET {endpoint}/openai/v1/video/generations/{generation-id}/content/video?api-version=preview
```

**Purpose**  
Retrieves the generated video content.

### URI Parameters

| Name | In | Required | Type | Description |
|------|----|----------|------|-------------|
| `endpoint` | path | Yes | string (url) | Azure OpenAI endpoint (same as above). |
| `api-version` | query | No | string | API version (default: `v1`). |
| `generation-id` | path | Yes | string | ID of the video generation. |
| `quality` | query | No | - | - |

### Request Headers

Same as **Create** section.

### Responses

| Status Code | Content-Type | Type | Description |
|-------------|--------------|------|-------------|
| 200 | `video/mp4` | string | Request succeeded. |
| default | `application/json` | `AzureOpenAIVideoGenerationErrorResponse` | Unexpected error. |

---

## Video Generations - Retrieve Video Content Headers Only

**HTTP Request**

```http
HEAD {endpoint}/openai/v1/video/generations/{generation-id}/content/video?api-version=preview
```

**Purpose**  
Retrieves headers for the generated video content.

### URI Parameters

Same as **Retrieve Video Content** section.

### Request Headers

Same as **Create** section.

### Responses

| Status Code | Content-Type | Type | Description |
|-------------|--------------|------|-------------|
| 200 | - | - | Request succeeded (headers only). |
| default | `application/json` | `AzureOpenAIVideoGenerationErrorResponse` | Unexpected error. |

---

