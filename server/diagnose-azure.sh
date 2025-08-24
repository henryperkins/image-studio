#!/bin/bash

# Azure OpenAI Diagnostic Script - Video Generation API
# Tests both standard endpoints and video generation (Sora) endpoints

source .env

echo "Azure OpenAI Video Generation Diagnostic Test"
echo "============================================="
echo ""
echo "Configuration:"
echo "  Endpoint: $AZURE_OPENAI_ENDPOINT"
echo "  Vision Deployment: $AZURE_OPENAI_VISION_DEPLOYMENT"
echo "  Video Deployment: $AZURE_OPENAI_VIDEO_DEPLOYMENT"
echo "  API Version: $AZURE_OPENAI_API_VERSION"
echo ""

# Remove trailing slash from endpoint
ENDPOINT="${AZURE_OPENAI_ENDPOINT%/}"

echo "Test 1: List deployments"
echo "------------------------"
echo "URL: $ENDPOINT/openai/deployments?api-version=2025-04-01-preview"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$ENDPOINT/openai/deployments?api-version=2025-04-01-preview" \
  -H "api-key: $AZURE_OPENAI_API_KEY")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
echo "Status: $HTTP_STATUS"
echo "Response: $(echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY" | head -100)"
echo ""

echo "Test 2: Video Generation - Create Job (Deployment path - legacy/alternative)"
echo "----------------------------------------------------------------------------"
echo "URL: $ENDPOINT/openai/deployments/$AZURE_OPENAI_VIDEO_DEPLOYMENT/video/generations/jobs?api-version=$AZURE_OPENAI_API_VERSION"
echo "Payload: {\"prompt\": \"A serene beach at sunset\", \"width\": 1024, \"height\": 768, \"n_seconds\": 5}"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  "$ENDPOINT/openai/deployments/$AZURE_OPENAI_VIDEO_DEPLOYMENT/video/generations/jobs?api-version=$AZURE_OPENAI_API_VERSION" \
  -H "api-key: $AZURE_OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A serene beach at sunset", "width": 1024, "height": 768, "n_seconds": 5}')
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
echo "Status: $HTTP_STATUS"
echo "Response: $(echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY")"
echo ""

# Extract job ID if successful
if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "202" ]; then
  JOB_ID=$(echo "$BODY" | jq -r '.id' 2>/dev/null)
  if [ ! -z "$JOB_ID" ] && [ "$JOB_ID" != "null" ]; then
    echo "Job created successfully! Job ID: $JOB_ID"
    echo ""
    echo "Test 3: Get Job Status"
    echo "----------------------"
    echo "URL: $ENDPOINT/openai/deployments/$AZURE_OPENAI_VIDEO_DEPLOYMENT/video/generations/jobs/$JOB_ID?api-version=$AZURE_OPENAI_API_VERSION"
    sleep 2
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
      "$ENDPOINT/openai/deployments/$AZURE_OPENAI_VIDEO_DEPLOYMENT/video/generations/jobs/$JOB_ID?api-version=$AZURE_OPENAI_API_VERSION" \
      -H "api-key: $AZURE_OPENAI_API_KEY")
    HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
    BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
    echo "Status: $HTTP_STATUS"
    echo "Response: $(echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY")"
  fi
fi
echo ""

echo "Test 4: v1 Path (canonical per current preview docs)"
echo "----------------------------------------------------"
echo "URL: $ENDPOINT/openai/v1/video/generations/jobs?api-version=$AZURE_OPENAI_API_VERSION"
echo "Payload: {\"model\": \"$AZURE_OPENAI_VIDEO_DEPLOYMENT\", \"prompt\": \"test\", \"width\": 256, \"height\": 256, \"n_seconds\": 1}"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  "$ENDPOINT/openai/v1/video/generations/jobs?api-version=$AZURE_OPENAI_API_VERSION" \
  -H "api-key: $AZURE_OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$AZURE_OPENAI_VIDEO_DEPLOYMENT\", \"prompt\": \"test\", \"width\": 256, \"height\": 256, \"n_seconds\": 1}")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
echo "Status: $HTTP_STATUS"
echo "Response: $(echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY")"
echo ""

echo "Test 5: Check Vision API (GPT-5) for comparison"
echo "-----------------------------------------------"
echo "URL: $ENDPOINT/openai/deployments/$AZURE_OPENAI_VISION_DEPLOYMENT/chat/completions?api-version=$AZURE_OPENAI_CHAT_API_VERSION"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  "$ENDPOINT/openai/deployments/$AZURE_OPENAI_VISION_DEPLOYMENT/chat/completions?api-version=$AZURE_OPENAI_CHAT_API_VERSION" \
  -H "api-key: $AZURE_OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}],"max_tokens":1}')
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d':' -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
echo "Status: $HTTP_STATUS"
echo "Response: $(echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY" | head -50)"
echo ""

echo "Diagnosis Summary:"
echo "=================="
echo ""
echo "If you're seeing 404 errors for video generation:"
echo "1. The deployment '$AZURE_OPENAI_VIDEO_DEPLOYMENT' may not exist or may not support video generation"
echo "2. Your Azure subscription may not have access to Sora/video generation preview"
echo "3. The recommended endpoint format (preview) is: /openai/v1/video/generations/jobs (include 'model' in JSON)."
echo "4. The deployment-specific endpoint is legacy/alternative: /openai/deployments/{deployment}/video/generations/jobs (no 'model' field)."
echo ""
echo "Next steps:"
echo "- Check Azure Portal to verify your deployments and their capabilities"
echo "- Ensure your subscription has access to video generation preview features"
echo "- Prefer the v1 endpoints. Only fall back to deployments path if required by your environment"
