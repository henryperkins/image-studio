#!/bin/bash

# Image Studio Production Deployment Script
# For https://studio.lakefrontdigital.io

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="studio.lakefrontdigital.io"
COMPOSE_PROJECT_NAME="image-studio"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking requirements..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    # Check Docker Compose
    if ! command -v docker &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    # Check if .env exists
    if [ ! -f "server/.env" ]; then
        log_warn "server/.env not found. Creating from template..."
        if [ -f "server/.env.example" ]; then
            cp server/.env.example server/.env
            log_warn "Please edit server/.env with your Azure OpenAI credentials"
            exit 1
        else
            log_error "No .env or .env.example found in server/"
            exit 1
        fi
    fi

    log_info "All requirements met"
}

setup_ssl() {
    log_info "Setting up SSL certificates..."

    if [ ! -d "ssl" ]; then
        mkdir -p ssl
        log_warn "SSL directory created. Please add your Cloudflare certificates:"
        echo "  1. Place your certificate in: ssl/cert.pem"
        echo "  2. Place your private key in: ssl/key.pem"
        echo ""
        echo "To generate Cloudflare Origin Certificate:"
        echo "  1. Go to Cloudflare Dashboard > SSL/TLS > Origin Server"
        echo "  2. Click 'Create Certificate'"
        echo "  3. Save the certificate and key to the ssl/ directory"
        return 1
    fi

    if [ ! -f "ssl/cert.pem" ] || [ ! -f "ssl/key.pem" ]; then
        log_error "SSL certificates not found in ssl/ directory"
        echo "Please add:"
        echo "  - ssl/cert.pem (Cloudflare Origin Certificate)"
        echo "  - ssl/key.pem (Private Key)"
        return 1
    fi

    # Set proper permissions
    chmod 600 ssl/key.pem
    chmod 644 ssl/cert.pem

    log_info "SSL certificates configured"
    return 0
}

build_containers() {
    log_info "Building Docker containers..."
    docker compose build
    log_info "Containers built successfully"
}

deploy_http() {
    log_info "Deploying HTTP-only configuration (Cloudflare Flexible SSL)..."

    # Stop existing containers
    docker compose down 2>/dev/null || true

    # Start with production config
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

    log_info "HTTP deployment complete"
    log_info "Configure Cloudflare:"
    echo "  1. Set SSL/TLS mode to 'Flexible'"
    echo "  2. Enable 'Always Use HTTPS'"
    echo "  3. Point DNS A record to your server IP"
}

deploy_https() {
    log_info "Deploying HTTPS configuration (Cloudflare Full/Strict SSL)..."

    # Check SSL setup
    if ! setup_ssl; then
        log_error "SSL setup failed. Falling back to HTTP deployment"
        deploy_http
        return
    fi

    # Stop existing containers
    docker compose down 2>/dev/null || true

    # Start with SSL and production config
    docker compose -f docker-compose.yml -f docker-compose.ssl.yml -f docker-compose.prod.yml up -d

    log_info "HTTPS deployment complete"
    log_info "Configure Cloudflare:"
    echo "  1. Set SSL/TLS mode to 'Full (strict)'"
    echo "  2. Enable 'Always Use HTTPS'"
    echo "  3. Point DNS A record to your server IP"
}

check_health() {
    log_info "Checking service health..."

    # Wait for services to start
    sleep 5

    # Check nginx
    if curl -s -o /dev/null -w "%{http_code}" http://localhost/health | grep -q "200"; then
        log_info "nginx is healthy"
    else
        log_warn "nginx health check failed"
    fi

    # Check API
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/healthz | grep -q "200"; then
        log_info "API is healthy"
    else
        log_warn "API health check failed"
    fi

    # Show container status
    docker compose ps
}

show_logs() {
    log_info "Showing container logs..."
    docker compose logs --tail=50 -f
}

stop_services() {
    log_info "Stopping services..."
    docker compose down
    log_info "Services stopped"
}

restart_services() {
    log_info "Restarting services..."
    docker compose restart
    log_info "Services restarted"
}

backup_data() {
    log_info "Creating backup..."

    BACKUP_DIR="backups"
    mkdir -p $BACKUP_DIR

    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/media-backup-$TIMESTAMP.tar.gz"

    # Create backup
    docker run --rm \
        -v ${COMPOSE_PROJECT_NAME}_media-data:/data \
        -v $(pwd)/$BACKUP_DIR:/backup \
        alpine tar czf /backup/media-backup-$TIMESTAMP.tar.gz -C /data .

    log_info "Backup created: $BACKUP_FILE"

    # Keep only last 7 backups
    ls -t $BACKUP_DIR/media-backup-*.tar.gz | tail -n +8 | xargs -r rm
    log_info "Old backups cleaned up"
}

restore_data() {
    if [ -z "$1" ]; then
        log_error "Please specify backup file to restore"
        echo "Usage: $0 restore <backup-file>"
        echo "Available backups:"
        ls -la backups/media-backup-*.tar.gz 2>/dev/null || echo "No backups found"
        exit 1
    fi

    if [ ! -f "$1" ]; then
        log_error "Backup file not found: $1"
        exit 1
    fi

    log_warn "This will overwrite existing data. Continue? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled"
        exit 0
    fi

    log_info "Restoring from $1..."

    # Stop services
    docker compose down

    # Restore data
    docker run --rm \
        -v ${COMPOSE_PROJECT_NAME}_media-data:/data \
        -v $(pwd):/backup \
        alpine tar xzf /backup/$1 -C /data

    log_info "Data restored"

    # Restart services
    deploy_https
}

update_cloudflare_ips() {
    log_info "Updating Cloudflare IP ranges..."

    # Fetch latest Cloudflare IPs
    CF_IPV4=$(curl -s https://www.cloudflare.com/ips-v4)
    CF_IPV6=$(curl -s https://www.cloudflare.com/ips-v6)

    # Create updated nginx config snippet
    cat > nginx/cloudflare-ips.conf << EOF
# Cloudflare IP ranges - Updated $(date)
# IPv4
EOF

    for ip in $CF_IPV4; do
        echo "set_real_ip_from $ip;" >> nginx/cloudflare-ips.conf
    done

    echo "" >> nginx/cloudflare-ips.conf
    echo "# IPv6" >> nginx/cloudflare-ips.conf

    for ip in $CF_IPV6; do
        echo "set_real_ip_from $ip;" >> nginx/cloudflare-ips.conf
    done

    echo "" >> nginx/cloudflare-ips.conf
    echo "real_ip_header CF-Connecting-IP;" >> nginx/cloudflare-ips.conf
    echo "real_ip_recursive on;" >> nginx/cloudflare-ips.conf

    log_info "Cloudflare IPs updated in nginx/cloudflare-ips.conf"
    log_info "Rebuild and restart nginx to apply changes"
}

show_status() {
    log_info "Service Status:"
    docker compose ps

    echo ""
    log_info "Resource Usage:"
    docker stats --no-stream

    echo ""
    log_info "Public URL: https://$DOMAIN"
    log_info "Health Check: https://$DOMAIN/health"
    log_info "API Health: https://$DOMAIN/api/healthz"
}

# Main script
case "$1" in
    deploy)
        check_requirements
        build_containers
        if [ "$2" == "https" ]; then
            deploy_https
        else
            deploy_http
        fi
        check_health
        ;;
    deploy-http)
        check_requirements
        build_containers
        deploy_http
        check_health
        ;;
    deploy-https)
        check_requirements
        build_containers
        deploy_https
        check_health
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        check_health
        ;;
    logs)
        show_logs
        ;;
    status)
        show_status
        ;;
    backup)
        backup_data
        ;;
    restore)
        restore_data "$2"
        ;;
    update-ips)
        update_cloudflare_ips
        ;;
    health)
        check_health
        ;;
    *)
        echo "Image Studio Deployment Script"
        echo "Usage: $0 {command} [options]"
        echo ""
        echo "Commands:"
        echo "  deploy [https]  - Deploy with HTTP (default) or HTTPS"
        echo "  deploy-http     - Deploy with HTTP only (Cloudflare Flexible SSL)"
        echo "  deploy-https    - Deploy with HTTPS (Cloudflare Full/Strict SSL)"
        echo "  stop            - Stop all services"
        echo "  restart         - Restart all services"
        echo "  logs            - Show container logs"
        echo "  status          - Show service status"
        echo "  health          - Check service health"
        echo "  backup          - Create data backup"
        echo "  restore <file>  - Restore from backup"
        echo "  update-ips      - Update Cloudflare IP ranges"
        echo ""
        echo "Examples:"
        echo "  $0 deploy        # Deploy with HTTP (Cloudflare Flexible SSL)"
        echo "  $0 deploy https  # Deploy with HTTPS (requires SSL certs)"
        echo "  $0 logs          # View logs"
        echo "  $0 backup        # Create backup"
        exit 1
        ;;
esac