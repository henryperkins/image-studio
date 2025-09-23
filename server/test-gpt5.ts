#!/usr/bin/env tsx

// Test script for Azure OpenAI GPT-5 with Responses API
import dotenv from 'dotenv';
import { createResponse, convertMessagesToResponsesInput } from './src/lib/responses-api.js';

// Load environment variables
dotenv.config();

// Helper to extract text from GPT-5 response format
function extractResponseText(response: any): string {
  // Try direct output_text first
  if (response?.output_text) {
    return response.output_text;
  }
  
  // Look for message type in output array
  if (response?.output) {
    const messageOutput = response.output.find((o: any) => o.type === 'message');
    if (messageOutput?.content) {
      const textContent = messageOutput.content.find((c: any) => 
        c.type === 'output_text' || c.type === 'text'
      );
      if (textContent?.text) {
        return textContent.text;
      }
    }
  }
  
  // Fallback to choices format
  if (response?.choices?.[0]?.message?.content) {
    return response.choices[0].message.content;
  }
  
  return 'No text found in response';
}

async function testGPT5() {
  console.log('Testing Azure OpenAI GPT-5 with Responses API...\n');

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_VISION_DEPLOYMENT || 'gpt-5';

  if (!endpoint || !apiKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   AZURE_OPENAI_ENDPOINT:', endpoint ? '✓' : '✗');
    console.error('   AZURE_OPENAI_API_KEY:', apiKey ? '✓' : '✗');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log('  Endpoint:', endpoint);
  console.log('  Deployment:', deployment);
  console.log('  API Path: /openai/v1/responses');
  console.log(`  API Version: ${process.env.AZURE_OPENAI_API_VERSION || 'v1'}\n`);

  // Test 1: Simple text-only request
  console.log('Test 1: Text-only request');
  console.log('------------------------');
  try {
    const response = await createResponse({
      model: deployment,
      input: [
        { role: 'developer', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is 2+2?' }
      ],
      max_output_tokens: 50
    }, {
      endpoint,
      deployment,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || 'v1',
      authHeaders: { 'api-key': apiKey }
    });

    console.log('✅ Success!');
    const text = extractResponseText(response);
    console.log('Response:', text);
  } catch (error: any) {
    console.error('❌ Failed:', error.message);
    if (error.body) {
      console.error('Error details:', error.body);
    }
  }

  console.log('\n');

  // Test 2: Multimodal request with image
  console.log('Test 2: Multimodal request (text + image)');
  console.log('----------------------------------------');
  try {
    const messages = [
      { 
        role: 'user', 
        content: [
          { type: 'text', text: 'What is in this image?' },
          { 
            type: 'image_url', 
            image_url: { 
              url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/320px-Cat03.jpg',
              detail: 'high' // This will be stripped by conversion
            }
          }
        ]
      }
    ];

    // Convert to Responses API format
    const input = convertMessagesToResponsesInput(messages);
    
    console.log('Converted input format:');
    console.log(JSON.stringify(input, null, 2));

    const response = await createResponse({
      model: deployment,
      input,
      max_output_tokens: 100
    }, {
      endpoint,
      deployment,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || 'v1',
      authHeaders: { 'api-key': apiKey }
    });

    console.log('✅ Success!');
    const text = extractResponseText(response);
    console.log('Response:', text);
  } catch (error: any) {
    console.error('❌ Failed:', error.message);
    if (error.body) {
      console.error('Error details:', error.body);
    }
  }

  console.log('\n');

  // Test 3: Direct cURL equivalent test
  console.log('Test 3: Direct API test (equivalent to cURL)');
  console.log('-------------------------------------------');
  
  let baseUrl = endpoint.replace(/\/+$/, ''); // Remove trailing slashes
  if (!baseUrl.includes('/openai/v1')) {
    baseUrl = `${baseUrl}/openai/v1`;
  }
  const testUrl = `${baseUrl}/responses?api-version=${process.env.AZURE_OPENAI_API_VERSION || 'v1'}`;
  console.log('URL:', testUrl);
  
  try {
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: deployment,
        input: [{ role: 'user', content: 'Hello, GPT-5!' }],
        max_output_tokens: 50
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Success!');
      const text = extractResponseText(data);
      console.log('Response:', text);
    } else {
      console.error('❌ Failed with status:', response.status);
      console.error('Response:', data);
    }
  } catch (error: any) {
    console.error('❌ Network error:', error.message);
  }

  console.log('\n✨ Test complete!');
}

// Run the test
testGPT5().catch(console.error);
