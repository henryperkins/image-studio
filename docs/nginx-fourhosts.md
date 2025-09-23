Nginx shared reverse-proxy (four hosts) with Cloudflare

This guide shows how to run Image Studio behind a shared Nginx reverse-proxy that serves multiple hostnames (4+), with DNS on Cloudflare.

Assumptions
- You already have a dedicated reverse-proxy container (the “fourhosts” Nginx) that terminates TLS and routes by Host.
- Cloudflare is your DNS (orange cloud enabled). Recommended SSL mode: Full (strict).
- You deploy Image Studio with Docker Compose from this repo.

1) Create a shared Docker network
- On the host that runs both stacks:
  - docker network create fourhosts

2) Bring up Image Studio attached to the shared network
- Use the edge override so the app’s nginx is reachable by the fourhosts proxy by name.
  - docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.edge.yml up -d --build

Notes
- The edge override attaches service `image-studio-nginx` to the external network `fourhosts` with an alias of the same name. No public ports are required in production; the fourhosts proxy will connect over the shared network.
- Ensure server/.env has CORS_ORIGIN listing all public origins, comma-separated, e.g.:
  - CORS_ORIGIN=https://studio.example.com,https://media.example.com,https://app.example.net,https://fourth.example.org

3) Configure the fourhosts Nginx
- Copy the provided vhost include and adjust hostnames/cert paths as needed:
  - File to include: nginx-studio-subdomain.conf (in repo root) or use the template below.
- Key bits:
  - Server blocks on 80 redirect to HTTPS.
  - Server blocks on 443 terminate TLS (use Cloudflare Origin certs or your LE certs) and proxy to http://image-studio-nginx:80 on the shared network.
  - Increase client_max_body_size for uploads.
  - Keep proxy_* timeouts generous for longer operations.

Example template (for fourhosts proxy)

  upstream image_studio {
      server image-studio-nginx:80;
      keepalive 32;
  }

  server {
      listen 80;
      server_name studio.example.com;
      location /.well-known/acme-challenge/ { root /var/www/certbot; }
      return 301 https://$host$request_uri;
  }

  server {
      listen 443 ssl http2;
      server_name studio.example.com;

      ssl_certificate /etc/nginx/certs/fullchain.pem;    # adjust
      ssl_certificate_key /etc/nginx/certs/privkey.pem;  # adjust

      client_max_body_size 100M;
      proxy_connect_timeout 600s;
      proxy_send_timeout 600s;
      proxy_read_timeout 600s;
      send_timeout 600s;

      location / {
          proxy_pass http://image_studio;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_cache_bypass $http_upgrade;
          proxy_buffering off;
          proxy_request_buffering off;
      }
  }

Repeat the two server blocks for each of your four hostnames. If your proxy already centralizes SSL and you prefer a single server with `server_name host1 host2 host3 host4;`, you can collapse them into one set of blocks.

Cloudflare specifics
- SSL/TLS: set to Full (strict) and install Cloudflare Origin Certificates in the fourhosts container, or use Let’s Encrypt DNS-01.
- Real IP: if you want real client IPs in upstream logs, add Cloudflare `set_real_ip_from` ranges and `real_ip_header CF-Connecting-IP;` in the fourhosts proxy (not required in the app’s inner nginx).

4) Health and debugging
- App health: http://image-studio-nginx/health from the fourhosts container should return 200.
- End-to-end: curl -I https://your.public.host/health via Cloudflare should return 200 and HSTS, etc.
- If 502/host not found: verify both containers are attached to the `fourhosts` network and that the upstream matches the alias `image-studio-nginx`.

5) Optional: remove public ports on the app
- In production, you can avoid exposing `80:80` from the app’s nginx. The fourhosts proxy will be the only public entry.

