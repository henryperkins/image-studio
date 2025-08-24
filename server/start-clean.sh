#!/bin/bash

# Unset any system Azure environment variables
unset AZURE_OPENAI_ENDPOINT
unset AZURE_OPENAI_API_VERSION
unset AZURE_OPENAI_CHAT_API_VERSION

# Start the server with clean environment - dotenv will load from .env file
exec npm run dev