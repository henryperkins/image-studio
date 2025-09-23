#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_PORT=8787
WEB_PORT=5174
SERVER_DIR="./server"
WEB_DIR="./web"
PID_FILE="/tmp/image-studio-pids"
LOG_DIR="./logs"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if a port is in use
is_port_in_use() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to kill process on a specific port
kill_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pids" ]; then
        print_warning "Found process(es) on port $port: $pids"
        for pid in $pids; do
            local process_name=$(ps -p $pid -o comm= 2>/dev/null)
            print_info "Killing process '$process_name' (PID: $pid) on port $port"
            # Try graceful stop first
            kill -TERM $pid 2>/dev/null || true
            for i in {1..10}; do
                if ! kill -0 $pid 2>/dev/null; then
                    break
                fi
                sleep 0.2
            done
            # Force kill if still alive
            if kill -0 $pid 2>/dev/null; then
                kill -KILL $pid 2>/dev/null || true
            fi
            if ! kill -0 $pid 2>/dev/null; then
                print_success "Process killed successfully"
            else
                print_error "Failed to kill process $pid"
            fi
        done
    else
        print_info "No process found on port $port"
    fi
}

# Function to clean up ports
cleanup_ports() {
    print_info "Cleaning up ports..."
    kill_port $SERVER_PORT
    kill_port $WEB_PORT
}

# Function to check dependencies
check_dependencies() {
    print_info "Checking dependencies..."
    
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install it first."
        exit 1
    fi
    
    print_success "All dependencies are installed"
}

# Function to install packages if needed
install_packages() {
    print_info "Checking package installations..."
    
    if [ ! -d "node_modules" ]; then
        print_info "Installing root packages..."
        pnpm install
    fi
    
    if [ ! -d "$SERVER_DIR/node_modules" ]; then
        print_info "Installing server packages..."
        cd $SERVER_DIR && pnpm install && cd ..
    fi
    
    if [ ! -d "$WEB_DIR/node_modules" ]; then
        print_info "Installing web packages..."
        cd $WEB_DIR && pnpm install && cd ..
    fi
    
    print_success "All packages are installed"
}

# Function to check if server is healthy
check_server_health() {
    local max_attempts=30
    local attempt=0
    
    print_info "Waiting for server to be ready..."
    
    while [ $attempt -lt $max_attempts ]; do
        if [ "$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$SERVER_PORT/healthz 2>/dev/null)" = "200" ]; then
            print_success "Server is responding on port $SERVER_PORT"
            return 0
        fi
        
        attempt=$((attempt + 1))
        sleep 1
    done
    
    print_error "Server failed to start within 30 seconds"
    return 1
}

# Function to check if web server is healthy
check_web_health() {
    local max_attempts=30
    local attempt=0
    
    print_info "Waiting for web server to be ready..."
    
    # First check if Vite started on the expected port
    while [ $attempt -lt $max_attempts ]; do
        if curl -s -o /dev/null -w "%{http_code}" http://localhost:$WEB_PORT 2>/dev/null | grep -q "200\|304"; then
            print_success "Web server is responding on port $WEB_PORT"
            return 0
        fi
        
        attempt=$((attempt + 1))
        sleep 1
    done
    
    # If not found on expected port, check logs for actual port
    if [ -f "$LOG_DIR/dev.log" ]; then
        local actual_port=$(grep -oP "Local:\s+http://localhost:\K[0-9]+" "$LOG_DIR/dev.log" | tail -1)
        if [ -n "$actual_port" ] && [ "$actual_port" != "$WEB_PORT" ]; then
            print_warning "Web server started on port $actual_port instead of $WEB_PORT"
            if curl -s -o /dev/null -w "%{http_code}" http://localhost:$actual_port 2>/dev/null | grep -q "200\|304"; then
                print_success "Web server is responding on port $actual_port"
                print_info "Web: http://localhost:$actual_port"
                return 0
            fi
        fi
    fi
    
    print_error "Web server failed to start within 30 seconds"
    return 1
}

# Function to start servers
start_servers() {
    print_info "Starting servers..."

    # Clean up any existing processes first
    cleanup_ports

    # Start the development servers in background
    print_info "Starting development servers..."

    # Start both servers using pnpm dev (which uses concurrently)
    VITE_DEV_PORT=$WEB_PORT pnpm dev > "$LOG_DIR/dev.log" 2>&1 &
    local main_pid=$!
    echo $main_pid > $PID_FILE

    print_info "Started development servers (PID: $main_pid)"
    print_info "Logs are being written to $LOG_DIR/dev.log"

    # Wait for servers to start
    sleep 5

    # Check health
    if check_server_health && check_web_health; then
        print_success "All servers are running!"
        print_info "Server: http://localhost:$SERVER_PORT"
        print_info "Web: http://localhost:$WEB_PORT"
    else
        print_error "Servers failed to start properly"
        print_info "Check logs at: $LOG_DIR/dev.log"
        return 1
    fi
}

# Function to stop servers
stop_servers() {
    print_info "Stopping servers..."

    # First, kill all node processes on our ports
    cleanup_ports

    # Try to stop using the PID file if it exists
    if [ -f $PID_FILE ]; then
        local main_pid=$(cat $PID_FILE)
        if kill -0 $main_pid 2>/dev/null; then
            print_info "Stopping main process (PID: $main_pid)..."
            # Kill the process and its children
            pkill -P $main_pid 2>/dev/null || true
            kill -TERM $main_pid 2>/dev/null || true
            sleep 2
            # Force kill if still running
            kill -9 $main_pid 2>/dev/null || true
        fi
        rm -f $PID_FILE
    fi

    # Clean up any remaining processes
    pkill -f "tsx.*src/index.ts" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    pkill -f "concurrently.*dev" 2>/dev/null || true

    # Final cleanup of ports
    cleanup_ports

    print_success "All servers stopped"
}

# Function to restart servers
restart_servers() {
    print_info "Restarting servers..."
    stop_servers
    sleep 3
    start_servers
}

# Function to show status
show_status() {
    print_info "Checking server status..."
    
    echo ""
    if is_port_in_use $SERVER_PORT; then
        local server_pid=$(lsof -ti:$SERVER_PORT 2>/dev/null | head -1)
        print_success "API Server is running (PID: $server_pid) on port $SERVER_PORT"
    else
        print_warning "API Server is not running"
    fi
    
    if is_port_in_use $WEB_PORT; then
        local web_pid=$(lsof -ti:$WEB_PORT 2>/dev/null | head -1)
        print_success "Web Server is running (PID: $web_pid) on port $WEB_PORT"
    else
        print_warning "Web Server is not running"
    fi
    
    echo ""
    
    # Check if main process is running
    if [ -f $PID_FILE ]; then
        local main_pid=$(cat $PID_FILE)
        if kill -0 $main_pid 2>/dev/null; then
            print_info "Main process is running (PID: $main_pid)"
        else
            print_warning "Main process is not running (stale PID file)"
            rm -f $PID_FILE
        fi
    fi
}

# Function to tail logs
tail_logs() {
    if [ -f "$LOG_DIR/dev.log" ]; then
        print_info "Tailing logs from $LOG_DIR/dev.log (Ctrl+C to stop)..."
        tail -f "$LOG_DIR/dev.log"
    else
        print_error "No log file found at $LOG_DIR/dev.log"
    fi
}

# Function to build for production
build_production() {
    print_info "Building for production..."
    
    # Check dependencies first
    check_dependencies
    install_packages
    
    print_info "Building web application with Vite..."
    cd $WEB_DIR
    pnpm build
    if [ $? -eq 0 ]; then
        print_success "Web build completed successfully"
    else
        print_error "Web build failed"
        cd ..
        return 1
    fi
    cd ..
    
    print_info "Building server with tsup..."
    cd $SERVER_DIR
    pnpm build
    if [ $? -eq 0 ]; then
        print_success "Server build completed successfully"
    else
        print_error "Server build failed"
        cd ..
        return 1
    fi
    cd ..
    
    print_success "Production build completed!"
    print_info "Web build output: $WEB_DIR/dist/"
    print_info "Server build output: $SERVER_DIR/dist/"
}

# Function to start production server
start_production() {
    print_info "Starting production server..."
    
    # Check if production builds exist
    if [ ! -d "$SERVER_DIR/dist" ]; then
        print_warning "Server production build not found. Building now..."
        build_production
        if [ $? -ne 0 ]; then
            return 1
        fi
    fi
    
    if [ ! -d "$WEB_DIR/dist" ]; then
        print_warning "Web production build not found. Building now..."
        build_production
        if [ $? -ne 0 ]; then
            return 1
        fi
    fi
    
    # Automatically kill process on required port
    if is_port_in_use $SERVER_PORT; then
        print_warning "Port $SERVER_PORT is already in use - killing existing process"
        kill_port $SERVER_PORT
        sleep 1
    fi
    
    print_info "Starting production server on port $SERVER_PORT..."
    cd $SERVER_DIR
    NODE_ENV=production node dist/index.js > "$LOG_DIR/production.log" 2>&1 &
    local prod_pid=$!
    echo $prod_pid > "$PID_FILE.prod"
    cd ..
    
    print_info "Production server started (PID: $prod_pid)"
    print_info "Logs are being written to $LOG_DIR/production.log"
    
    sleep 2
    check_server_health
    
    print_success "Production server is running!"
    print_info "Server: http://localhost:$SERVER_PORT"
    print_info "Serving static files from: $WEB_DIR/dist/"
}

# Function to show help
show_help() {
    echo "Image Studio Development Server Manager"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start       Start all development servers"
    echo "  stop        Stop all development servers"
    echo "  restart     Restart all development servers"
    echo "  status      Show status of all servers"
    echo "  build       Build for production (Vite + tsup)"
    echo "  prod        Start production server"
    echo "  clean       Clean up all server processes on ports $SERVER_PORT and $WEB_PORT"
    echo "  install     Install all dependencies"
    echo "  logs        Tail the development logs"
    echo "  docker:build Build Docker images for production"
    echo "  docker:up    Start Docker containers (production)"
    echo "  docker:down  Stop Docker containers"
    echo "  docker:logs  View Docker container logs"
    echo "  docker:push  Push images to registry (requires login)"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start    # Start development servers"
    echo "  $0 build    # Build for production"
    echo "  $0 prod     # Start production server"
    echo "  $0 stop     # Stop all servers"
    echo "  $0 restart  # Restart development servers"
    echo "  $0 status   # Check server status"
    echo ""
    echo "Docker Examples:"
    echo "  $0 docker:build    # Build Docker images"
    echo "  $0 docker:up       # Start with docker-compose"
    echo "  $0 docker:down     # Stop containers"
}

# Function to load environment variables from server/.env
load_env() {
    if [ -f "$SERVER_DIR/.env" ]; then
        print_info "Loading environment variables from server/.env"
        set -a
        source "$SERVER_DIR/.env"
        set +a
    else
        print_warning "No .env file found at $SERVER_DIR/.env"
        print_info "Docker containers will use default environment variables"
    fi
}

# Function to build Docker images
docker_build() {
    print_info "Building Docker images..."

    # Load environment variables
    load_env

    # Build images
    docker compose build

    if [ $? -eq 0 ]; then
        print_success "Docker images built successfully"
    else
        print_error "Docker build failed"
        return 1
    fi
}

# Function to start Docker containers
docker_up() {
    print_info "Starting Docker containers..."

    # Load environment variables
    load_env

    # Check if production compose file exists
    if [ -f "docker-compose.prod.yml" ]; then
        print_info "Using production configuration"
        docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    else
        docker compose up -d
    fi

    if [ $? -eq 0 ]; then
        print_success "Docker containers started"
        print_info "Application available at: https://studio.lakefrontdigital.io"
        print_info "Run '$0 docker:logs' to view container logs"
    else
        print_error "Failed to start Docker containers"
        return 1
    fi
}

# Function to stop Docker containers
docker_down() {
    print_info "Stopping Docker containers..."

    if [ -f "docker-compose.prod.yml" ]; then
        docker compose -f docker-compose.yml -f docker-compose.prod.yml down
    else
        docker compose down
    fi

    if [ $? -eq 0 ]; then
        print_success "Docker containers stopped"
    else
        print_error "Failed to stop Docker containers"
        return 1
    fi
}

# Function to view Docker logs
docker_logs() {
    print_info "Viewing Docker container logs (Ctrl+C to exit)..."

    if [ -n "$2" ]; then
        docker compose logs -f "$2"
    else
        docker compose logs -f
    fi
}

# Function to push Docker images to registry
docker_push() {
    print_info "Pushing Docker images to registry..."

    # You can customize the registry and tags here
    REGISTRY="${DOCKER_REGISTRY:-docker.io}"
    IMAGE_PREFIX="${DOCKER_IMAGE_PREFIX:-lakefrontdigital}"
    VERSION="${VERSION:-latest}"

    print_info "Registry: $REGISTRY"
    print_info "Image prefix: $IMAGE_PREFIX"
    print_info "Version: $VERSION"

    # Tag images
    docker tag image-studio-nginx:latest "$REGISTRY/$IMAGE_PREFIX/image-studio-nginx:$VERSION"
    docker tag image-studio-api:latest "$REGISTRY/$IMAGE_PREFIX/image-studio-api:$VERSION"

    # Push images
    docker push "$REGISTRY/$IMAGE_PREFIX/image-studio-nginx:$VERSION"
    docker push "$REGISTRY/$IMAGE_PREFIX/image-studio-api:$VERSION"

    if [ $? -eq 0 ]; then
        print_success "Images pushed successfully"
    else
        print_error "Failed to push images"
        return 1
    fi
}

# Main script logic
case "$1" in
    start)
        check_dependencies
        install_packages
        start_servers
        ;;
    stop)
        stop_servers
        ;;
    restart)
        check_dependencies
        restart_servers
        ;;
    status)
        show_status
        ;;
    build)
        build_production
        ;;
    prod)
        start_production
        ;;
    clean)
        cleanup_ports
        print_success "Ports cleaned up"
        ;;
    install)
        check_dependencies
        install_packages
        ;;
    logs)
        tail_logs
        ;;
    docker:build)
        docker_build
        ;;
    docker:up)
        docker_up
        ;;
    docker:down)
        docker_down
        ;;
    docker:logs)
        docker_logs "$@"
        ;;
    docker:push)
        docker_push
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        if [ -z "$1" ]; then
            print_error "No command specified"
        else
            print_error "Unknown command: $1"
        fi
        echo ""
        show_help
        exit 1
        ;;
esac
