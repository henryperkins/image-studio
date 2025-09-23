#!/usr/bin/env tsx

// Test script to diagnose GPT-5 vision API digest error
import dotenv from 'dotenv';
import { callVisionAPI } from './src/lib/vision-api.js';
import { IMAGE_ANALYSIS_SCHEMA } from './src/lib/vision-schemas.js';
import { createImageUserMessage } from './src/lib/vision-prompts.js';

// Load environment variables
dotenv.config();

async function testVisionWithGPT5() {
  console.log('Testing GPT-5 Vision API with Schema Analysis...\n');

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_VISION_DEPLOYMENT || 'gpt-5';
  const chatApiVersion = process.env.AZURE_OPENAI_CHAT_API_VERSION || '2025-04-01-preview';
  // NOTE: For Responses API we use AZURE_OPENAI_API_VERSION (default v1)

  if (!endpoint || !apiKey) {
    console.error('❌ Missing required environment variables');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log('  Endpoint:', endpoint);
  console.log('  Deployment:', deployment);
  console.log('  API Version:', chatApiVersion);
  console.log('');

  // Test with a simple image URL
  const testImageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/320px-Cat03.jpg';
  
  console.log('Creating vision analysis request...');
  
  try {
    // Create messages with the vision prompt - note that createImageUserMessage returns just the text
    const userMessageText = createImageUserMessage({
      purpose: 'general description',
      audience: 'general public',
      language: 'en',
      detail: 'standard',
      tone: 'neutral professional'
    });

    const messages = [
      {
        role: 'system',
        content: 'You are an expert image analyst. Provide detailed, structured analysis of images.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: userMessageText },
          { 
            type: 'image_url', 
            image_url: { 
              url: testImageUrl,
              detail: 'high'
            }
          }
        ]
      }
    ];

    console.log('Messages structure:');
    console.log(JSON.stringify(messages, null, 2).substring(0, 500) + '...\n');

    // Test if the Responses API is being used
    const isGPT5 = deployment.toLowerCase().includes('gpt-5') || deployment.toLowerCase().includes('gpt5');
    console.log('Will use Responses API:', isGPT5);
    console.log('');

    console.log('Calling vision API...');
    const result = await callVisionAPI(
      messages,
      IMAGE_ANALYSIS_SCHEMA,
      {
        endpoint,
        deployment,
        apiVersion: chatApiVersion,
        authHeaders: { 'api-key': apiKey },
        maxTokens: 1500,
        temperature: 0.1,
        timeoutMs: 60000,
        mapToStructured: true
      }
    );

    console.log('✅ Success! Analysis result:');
    console.log(JSON.stringify(result, null, 2).substring(0, 1000));

  } catch (error: any) {
    console.error('❌ Error occurred:');
    console.error('  Message:', error.message);
    console.error('  Stack:', error.stack);
    
    if (error.status) {
      console.error('  HTTP Status:', error.status);
    }
    
    if (error.body) {
      console.error('  Response body:', error.body);
    }

    // Check for specific crypto/digest errors
    if (error.message?.includes('digest') || error.message?.includes('crypto')) {
      console.error('\n⚠️  Crypto/Digest Error Detected!');
      console.error('This might be related to:');
      console.error('1. Buffer operations in cache key generation');
      console.error('2. Node.js crypto module issues');
      console.error('3. Schema JSON stringification problems');
    }

    // Check for GPT-5 specific errors
    if (error.message?.includes('max_tokens') || error.message?.includes('max_completion_tokens')) {
      console.error('\n⚠️  GPT-5 Token Parameter Error!');
      console.error('GPT-5 requires "max_completion_tokens" instead of "max_tokens"');
      console.error('The Responses API uses "max_output_tokens" instead');
    }
  }
}

// Run the test
testVisionWithGPT5().catch(console.error);
