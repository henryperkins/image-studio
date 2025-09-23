# Deployment Guide - Image Studio

This guide covers deploying Image Studio to production using Docker, nginx, and Cloudflare.

## Prerequisites

- Docker and Docker Compose installed on your server
- Domain configured in Cloudflare (studio.lakefrontdigital.io)
- Azure OpenAI API credentials
- Server with ports 80 and 443 available

## Quick Start (HTTP-only with Cloudflare Flexible SSL)

This is the simplest setup where Cloudflare handles SSL and communicates with your server over HTTP.

```bash
# 1. Clone the repository
git clone <your-repo-url> image-studio
cd image-studio

# 2. Create environment file
cp server/.env.example server/.env
# Edit server/.env with your Azure OpenAI credentials

# 3. Build and start containers
./dev.sh docker:build
./dev.sh docker:up

# 4. Configure Cloudflare
# - Set SSL/TLS mode to "Flexible" in Cloudflare dashboard
# - Point A/AAAA record to your server IP
# - Enable "Always Use HTTPS" in SSL/TLS Edge Certificates
```

## Production Setup (HTTPS with Cloudflare Full/Full Strict SSL)

For enhanced security with end-to-end encryption.

### Step 1: Generate Cloudflare Origin Certificate

1. Go to Cloudflare Dashboard > SSL/TLS > Origin Server
2. Click "Create Certificate"
3. Keep the default settings (RSA, 15 years)
4. Save the certificate and private key

### Step 2: Setup SSL Certificates on Server

```bash
# Create SSL directory
mkdir -p ssl

# Save your Cloudflare origin certificate
nano ssl/cert.pem
# Paste the certificate content

# Save your private key
nano ssl/key.pem
# Paste the private key content

# Set proper permissions
chmod 600 ssl/key.pem
chmod 644 ssl/cert.pem
```

### Step 3: Deploy with SSL

```bash
# Build containers
./dev.sh docker:build

# Start with SSL configuration
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml -f docker-compose.prod.yml up -d

# Check status
./dev.sh docker:logs
```

### Step 4: Configure Cloudflare

1. Set SSL/TLS mode to "Full (strict)"
2. Enable "Always Use HTTPS"
3. Configure Page Rules (optional):
   - `*studio.lakefrontdigital.io/static/*` - Cache Level: Standard, Edge Cache TTL: 1 month
   - `*studio.lakefrontdigital.io/api/*` - Cache Level: Bypass

## Environment Variables

Create `server/.env` with:

```bash
# Azure OpenAI Configuration (Required)
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key

# Deployment Names
AZURE_OPENAI_IMAGE_DEPLOYMENT=gpt-image-1
AZURE_OPENAI_VIDEO_DEPLOYMENT=sora-deployment
AZURE_OPENAI_VISION_DEPLOYMENT=gpt-4-vision

# API Versions
AZURE_OPENAI_API_VERSION=preview
AZURE_OPENAI_CHAT_API_VERSION=2025-04-01-preview

# CORS (Production)
CORS_ORIGIN=https://studio.lakefrontdigital.io

# Optional: Content Safety
AZURE_CONTENT_SAFETY_ENDPOINT=your-content-safety-endpoint
AZURE_CONTENT_SAFETY_KEY=your-content-safety-key
```

## Docker Commands

```bash
# Build images
./dev.sh docker:build

# Start containers (development)
./dev.sh docker:up

# Start containers (production with SSL)
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml -f docker-compose.prod.yml up -d

# Stop containers
./dev.sh docker:down

# View logs
./dev.sh docker:logs
./dev.sh docker:logs nginx  # Specific container
./dev.sh docker:logs api

# Restart containers
./dev.sh docker:down && ./dev.sh docker:up

# Remove containers and volumes (WARNING: deletes data)
docker-compose down -v
```

## Data Persistence

Media files are stored in a Docker volume. To backup:

```bash
# Backup data
docker run --rm -v image-studio_media-data:/data -v $(pwd):/backup alpine tar czf /backup/media-backup.tar.gz -C /data .

# Restore data
docker run --rm -v image-studio_media-data:/data -v $(pwd):/backup alpine tar xzf /backup/media-backup.tar.gz -C /data
```

## Monitoring & Health Checks

Health check endpoints:
- nginx: `https://studio.lakefrontdigital.io/health`
- API: `https://studio.lakefrontdigital.io/api/healthz`

Monitor with:
```bash
# Check container status
docker-compose ps

# View resource usage
docker stats

# Check health
curl https://studio.lakefrontdigital.io/health
```

## Troubleshooting

### Container won't start
```bash
# Check logs
./dev.sh docker:logs

# Check port availability
sudo lsof -i :80
sudo lsof -i :443
```

### SSL Certificate Issues
- Ensure certificate files exist in `ssl/` directory
- Check file permissions (key.pem should be 600)
- Verify certificate is valid for your domain

### API Connection Issues
- Check CORS_ORIGIN matches your domain
- Verify Azure OpenAI credentials in server/.env
- Check firewall allows ports 80/443

### Performance Issues
- Adjust resource limits in docker-compose.prod.yml
- Enable caching in Cloudflare
- Check server resources (CPU, memory, disk)

## Security Recommendations

1. **Firewall Rules**: Only allow traffic from Cloudflare IPs
```bash
# Example with ufw
for ip in $(curl https://www.cloudflare.com/ips-v4); do
  sudo ufw allow from $ip to any port 80,443
done
```

2. **Rate Limiting**: Configure in Cloudflare dashboard
3. **WAF Rules**: Enable Cloudflare WAF for additional protection
4. **Regular Updates**: Keep Docker images updated
```bash
docker-compose pull
./dev.sh docker:build
```

5. **Secrets Management**: Never commit .env files to git

## Scaling

For high traffic:

1. **Horizontal Scaling**: Run multiple API containers
```yaml
# In docker-compose.yml
services:
  api:
    deploy:
      replicas: 3
```

2. **Load Balancing**: nginx automatically load balances between API replicas

3. **CDN**: Cloudflare automatically caches static assets

4. **Database**: For larger deployments, consider external storage instead of filesystem

## Backup Strategy

Automated daily backups:
```bash
# Create backup script
cat > /etc/cron.daily/backup-image-studio << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/image-studio"
mkdir -p $BACKUP_DIR
docker run --rm -v image-studio_media-data:/data -v $BACKUP_DIR:/backup alpine \
  tar czf /backup/media-$(date +%Y%m%d).tar.gz -C /data .
# Keep only last 7 days
find $BACKUP_DIR -name "media-*.tar.gz" -mtime +7 -delete
EOF

chmod +x /etc/cron.daily/backup-image-studio
```

## Support

For issues:
1. Check container logs: `./dev.sh docker:logs`
2. Verify environment variables are set correctly
3. Ensure Cloudflare DNS is properly configured
4. Check Azure OpenAI service status

## Next Steps

After deployment:
1. Test all features (image generation, video creation, editing)
2. Set up monitoring/alerting
3. Configure backups
4. Review Cloudflare analytics
5. Optimize caching rules based on usage patterns