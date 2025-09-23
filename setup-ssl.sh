#!/bin/bash

# SSL Setup Script for Image Studio
# This script helps you set up Cloudflare Origin Certificates

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}==================================${NC}"
echo -e "${BLUE}  Image Studio SSL Setup Helper   ${NC}"
echo -e "${BLUE}==================================${NC}"
echo ""

# Create SSL directory
if [ ! -d "ssl" ]; then
    echo -e "${GREEN}Creating ssl directory...${NC}"
    mkdir -p ssl
else
    echo -e "${YELLOW}SSL directory already exists${NC}"
fi

# Function to validate certificate
validate_cert() {
    local file=$1
    if openssl x509 -in "$file" -text -noout > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to validate private key
validate_key() {
    local file=$1
    if openssl rsa -in "$file" -check > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Check for existing certificates
if [ -f "ssl/cert.pem" ] && [ -f "ssl/key.pem" ]; then
    echo -e "${YELLOW}Existing SSL certificates found!${NC}"
    echo -e "Do you want to replace them? (y/N): \c"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}Keeping existing certificates${NC}"
        exit 0
    fi
fi

echo -e "${BLUE}Step 1: Origin Certificate${NC}"
echo -e "${YELLOW}────────────────────────────${NC}"
echo "Paste your Cloudflare Origin Certificate below"
echo "(starts with -----BEGIN CERTIFICATE-----)"
echo "Press Ctrl+D when done:"
echo ""

# Read certificate
CERT_CONTENT=$(cat)

# Save certificate
echo "$CERT_CONTENT" > ssl/cert.pem

# Validate certificate
if validate_cert "ssl/cert.pem"; then
    echo -e "${GREEN}✓ Certificate saved and validated${NC}"
else
    echo -e "${RED}✗ Invalid certificate format${NC}"
    rm ssl/cert.pem
    exit 1
fi

echo ""
echo -e "${BLUE}Step 2: Private Key${NC}"
echo -e "${YELLOW}────────────────────────────${NC}"
echo "Paste your Private Key below"
echo "(starts with -----BEGIN PRIVATE KEY----- or -----BEGIN RSA PRIVATE KEY-----)"
echo "Press Ctrl+D when done:"
echo ""

# Read private key
KEY_CONTENT=$(cat)

# Save private key
echo "$KEY_CONTENT" > ssl/key.pem

# Validate private key
if validate_key "ssl/key.pem"; then
    echo -e "${GREEN}✓ Private key saved and validated${NC}"
else
    echo -e "${RED}✗ Invalid private key format${NC}"
    rm ssl/key.pem
    exit 1
fi

# Set proper permissions
echo -e "${GREEN}Setting proper permissions...${NC}"
chmod 600 ssl/key.pem
chmod 644 ssl/cert.pem

echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}   SSL Setup Complete!            ${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""

# Show certificate information
echo -e "${BLUE}Certificate Information:${NC}"
openssl x509 -in ssl/cert.pem -noout -subject -dates | sed 's/^/  /'

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Set Cloudflare SSL mode to 'Full (strict)'"
echo "2. Deploy with HTTPS:"
echo -e "   ${GREEN}./deploy.sh deploy-https${NC}"
echo ""
echo -e "${YELLOW}Note: Make sure your Cloudflare SSL/TLS mode matches:${NC}"
echo "  - For this setup: Use 'Full' or 'Full (strict)'"
echo "  - Not 'Flexible' (that's for HTTP-only)"
echo ""