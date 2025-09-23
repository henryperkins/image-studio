#!/usr/bin/env tsx
/**
 * Azure OpenAI Image Generation Test Script
 * Tests the image generation endpoint configuration
 */

import 'dotenv/config';

const AZ = {
  endpoint: (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, ""),
  key: process.env.AZURE_OPENAI_API_KEY || "",
  token: process.env.AZURE_OPENAI_AUTH_TOKEN || "",
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "v1",
  imageDeployment: process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || "gpt-image-1"
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (AZ.token) {
    h["Authorization"] = `Bearer ${AZ.token}`;
  } else if (AZ.key) {
    h["api-key"] = AZ.key;
  }
  return h;
}

async function testImageGeneration() {
  console.log("\n=== Azure OpenAI Image Generation Test ===\n");

  // Check configuration
  console.log("📋 Configuration Check:");
  console.log(`  Endpoint: ${AZ.endpoint || "❌ NOT SET"}`);
  console.log(`  Auth: ${AZ.key ? "✅ API Key" : AZ.token ? "✅ Bearer Token" : "❌ NO AUTH"}`);
  console.log(`  API Version: ${AZ.apiVersion}`);
  console.log(`  Image Deployment: ${AZ.imageDeployment}`);

  if (!AZ.endpoint) {
    console.error("\n❌ AZURE_OPENAI_ENDPOINT not set!");
    console.log("\n💡 Set it in server/.env:");
    console.log("   AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com");
    process.exit(1);
  }

  if (!AZ.key && !AZ.token) {
    console.error("\n❌ No authentication configured!");
    console.log("\n💡 Set one of these in server/.env:");
    console.log("   AZURE_OPENAI_API_KEY=your-api-key");
    console.log("   AZURE_OPENAI_AUTH_TOKEN=your-bearer-token");
    process.exit(1);
  }

  // Construct URL
  const baseEndpoint = AZ.endpoint.replace(/\/+$/, "");
  const url = `${baseEndpoint}/openai/v1/images/generations?api-version=${AZ.apiVersion}`;

  console.log("\n🔗 Request Details:");
  console.log(`  URL: ${url}`);
  console.log(`  Method: POST`);
  console.log(`  Headers: ${JSON.stringify(Object.keys(authHeaders()))}`);

  // Test payload
  const requestBody = {
    model: AZ.imageDeployment,
    prompt: "A simple red circle on a white background",
    size: "1024x1024",
    quality: "low",
    output_format: "png",
    n: 1
  };

  console.log(`  Body: ${JSON.stringify(requestBody, null, 2)}`);

  console.log("\n🚀 Sending test request...");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`\n📨 Response Status: ${response.status} ${response.statusText}`);
    console.log(`  Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`);

    const responseText = await response.text();

    if (response.ok) {
      console.log("\n✅ SUCCESS! Image generation endpoint is working!");

      try {
        const data = JSON.parse(responseText);
        if (data?.data?.[0]?.b64_json) {
          console.log("\n🖼️  Image generated successfully!");
          console.log(`  Base64 length: ${data.data[0].b64_json.length} chars`);
        }
      } catch {
        console.log("\n📄 Response:", responseText);
      }
    } else {
      console.error("\n❌ Request failed!");

      if (response.status === 404) {
        console.log("\n🔍 404 Not Found - Troubleshooting:");
        console.log("\n1. Verify endpoint format:");
        console.log(`   ✓ Should be: https://<resource>.openai.azure.com`);
        console.log(`   ✓ Current: ${baseEndpoint}`);

        console.log("\n2. Verify path and API version:");
        console.log(`   ✓ Path should be: /openai/v1/images/generations`);
        console.log(`   ✓ API version should be: v1 (or your override)`);
        console.log(`   ✓ Full URL: ${url}`);

        console.log("\n3. Verify Azure resource configuration:");
        console.log(`   ✓ Ensure "Azure OpenAI Foundry models (Preview)" is enabled`);
        console.log(`   ✓ Check in Azure Portal → Your OpenAI Resource → Model deployments`);

        console.log("\n4. Verify deployment name:");
        console.log(`   ✓ Current deployment: ${AZ.imageDeployment}`);
        console.log(`   ✓ Check if this deployment exists in your Azure resource`);
        console.log(`   ✓ The deployment should be for a DALL-E model (gpt-image-1)`);
      } else if (response.status === 401) {
        console.log("\n🔒 401 Unauthorized - Authentication issue:");
        console.log("   ✓ Verify your API key or bearer token is correct");
        console.log("   ✓ Check if the key has proper permissions");
      } else if (response.status === 400) {
        console.log("\n⚠️  400 Bad Request - Check error details:");
      }

      console.log("\n📄 Error Response:");
      try {
        const errorData = JSON.parse(responseText);
        console.log(JSON.stringify(errorData, null, 2));
      } catch {
        console.log(responseText);
      }
    }
  } catch (error: any) {
    console.error("\n💥 Network error:", error.message);
    console.log("\n💡 Check:");
    console.log("   - Internet connection");
    console.log("   - Firewall/proxy settings");
    console.log("   - Endpoint URL is correct");
  }

  console.log("\n=== Test Complete ===\n");
}

// Run the test
testImageGeneration().catch(console.error);
