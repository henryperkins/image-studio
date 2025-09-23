# Cloudflare Setup Guide for studio.lakefrontdigital.io

This guide walks you through setting up Cloudflare for your Image Studio deployment.

## Prerequisites

- Domain registered and nameservers pointing to Cloudflare
- Access to Cloudflare dashboard
- Server with public IP address

## Step 1: DNS Configuration

### Add DNS Records

1. Go to Cloudflare Dashboard > DNS > Records
2. Add the following records:

```
Type: A
Name: studio (or @ for root domain)
IPv4 address: YOUR_SERVER_IP
Proxy status: Proxied (orange cloud ON)
TTL: Auto
```

If your server has IPv6:
```
Type: AAAA
Name: studio
IPv6 address: YOUR_SERVER_IPV6
Proxy status: Proxied (orange cloud ON)
TTL: Auto
```

## Step 2: SSL/TLS Configuration

### Option A: Flexible SSL (Easiest - HTTP between Cloudflare and Server)

1. Go to SSL/TLS > Overview
2. Select **Flexible** mode
3. Deploy using: `./deploy.sh deploy-http`

**Pros:**
- No SSL certificates needed on server
- Simplest setup
- Works immediately

**Cons:**
- Traffic between Cloudflare and server is unencrypted
- Not recommended for sensitive data

### Option B: Full SSL (Recommended - HTTPS with Cloudflare Origin Certificate)

1. Go to SSL/TLS > Overview
2. Select **Full** or **Full (strict)** mode

#### Generate Origin Certificate:

1. Go to SSL/TLS > Origin Server
2. Click **Create Certificate**
3. Choose:
   - Private key type: RSA (2048)
   - Hostnames: studio.lakefrontdigital.io
   - Certificate Validity: 15 years
4. Click **Create**
5. Save the certificate and private key:

```bash
# On your server
mkdir -p ssl
nano ssl/cert.pem  # Paste Origin Certificate
nano ssl/key.pem   # Paste Private Key
chmod 600 ssl/key.pem
chmod 644 ssl/cert.pem
```

6. Deploy using: `./deploy.sh deploy-https`

**Pros:**
- End-to-end encryption
- Better security
- Cloudflare can validate certificate (Full strict)

**Cons:**
- Requires certificate setup

## Step 3: Edge Certificates

1. Go to SSL/TLS > Edge Certificates
2. Enable these settings:
   - **Always Use HTTPS**: ON
   - **HTTP Strict Transport Security (HSTS)**: Enable with settings:
     - Max Age: 6 months
     - Include subdomains: Optional
     - Preload: Optional
   - **Minimum TLS Version**: 1.2
   - **Opportunistic Encryption**: ON
   - **TLS 1.3**: ON
   - **Automatic HTTPS Rewrites**: ON

## Step 4: Security Settings

### Firewall Rules

1. Go to Security > WAF
2. Create custom rules:

**Rule 1: Block Non-Cloudflare IPs (Optional - for strict security)**
```
Field: IP Source Address
Operator: is not in
Value: Use Cloudflare IP ranges
Action: Block
```

**Rule 2: Rate Limiting for API**
```
URI Path contains "/api"
Rate: 100 requests per minute per IP
Action: Challenge
```

### Bot Management

1. Go to Security > Bots
2. Configure Bot Fight Mode or Super Bot Fight Mode
3. Set to **Challenge** for suspicious bots

## Step 5: Performance Optimization

### Caching

1. Go to Caching > Configuration
2. Set **Caching Level**: Standard
3. Set **Browser Cache TTL**: Respect Existing Headers

### Page Rules (3 free rules)

1. Go to Rules > Page Rules
2. Create rules:

**Rule 1: Cache Static Assets**
```
URL: *studio.lakefrontdigital.io/static/*
Settings:
- Cache Level: Cache Everything
- Edge Cache TTL: 1 month
- Browser Cache TTL: 1 month
```

**Rule 2: Bypass Cache for API**
```
URL: *studio.lakefrontdigital.io/api/*
Settings:
- Cache Level: Bypass
- Disable Performance
```

**Rule 3: Cache Frontend Assets**
```
URL: *studio.lakefrontdigital.io/*.{js,css,png,jpg,jpeg,gif,svg,woff,woff2}
Settings:
- Cache Level: Cache Everything
- Edge Cache TTL: 1 year
```

### Speed Optimization

1. Go to Speed > Optimization
2. Enable:
   - **Auto Minify**: JavaScript, CSS, HTML
   - **Brotli**: ON
   - **Rocket Loader**: ON (test first, may affect some JS)
   - **Mirage**: ON (image optimization)
   - **Polish**: Lossless (image compression)

## Step 6: Analytics & Monitoring

### Web Analytics

1. Go to Analytics > Web Analytics
2. Add site if not already added
3. Copy and add tracking script to your app (optional)

### Real User Monitoring

1. Consider enabling for performance insights
2. Go to Analytics > Core Web Vitals

## Step 7: Network Settings

1. Go to Network
2. Configure:
   - **HTTP/2**: ON
   - **HTTP/3 (with QUIC)**: ON
   - **0-RTT Connection Resumption**: ON
   - **WebSockets**: ON (required for real-time features)
   - **IP Geolocation**: ON (optional)

## Step 8: Custom Error Pages (Optional)

1. Go to Custom Pages
2. Customize error pages for better UX:
   - 500 Class Errors
   - 1000 Class Errors (Cloudflare errors)
   - Always Online™ error page

## Verification Steps

After configuration, verify everything works:

```bash
# Check DNS propagation
nslookup studio.lakefrontdigital.io

# Test HTTPS
curl -I https://studio.lakefrontdigital.io

# Check SSL certificate
openssl s_client -connect studio.lakefrontdigital.io:443 -servername studio.lakefrontdigital.io

# Test health endpoints
curl https://studio.lakefrontdigital.io/health
curl https://studio.lakefrontdigital.io/api/healthz
```

## Monitoring Dashboard

Create a monitoring routine:

1. **Daily**: Check Analytics for traffic patterns
2. **Weekly**: Review Security Events
3. **Monthly**: Check Cache Analytics and optimize rules

## Troubleshooting

### Common Issues

**503 Error**
- Server is down or unreachable
- Check server firewall allows Cloudflare IPs
- Verify nginx is running

**521 Error**
- Web server is down
- Check if server is running: `./deploy.sh status`

**525 Error**
- SSL handshake failed
- Check SSL certificates are properly configured
- Verify SSL mode matches server configuration

**ERR_TOO_MANY_REDIRECTS**
- Usually caused by SSL mode mismatch
- If using Flexible mode, ensure server serves HTTP
- If using Full mode, ensure server has valid SSL

### Debug Mode

1. Go to SSL/TLS > Overview
2. Enable **Development Mode** temporarily
3. This bypasses cache and shows real-time changes

## Security Best Practices

1. **Use Full (strict) SSL mode** for production
2. **Enable HSTS** to prevent downgrade attacks
3. **Set up firewall rules** to block malicious traffic
4. **Enable Bot Protection** to prevent abuse
5. **Use Rate Limiting** on API endpoints
6. **Enable 2FA** on your Cloudflare account
7. **Audit Log** review for unauthorized changes
8. **Set up Alerts** for DDoS attacks or high error rates

## Cost Optimization

Free plan includes:
- Unlimited bandwidth
- Basic DDoS protection
- SSL certificates
- 3 page rules
- Basic analytics

Consider Pro plan ($20/month) for:
- Advanced DDoS protection
- WAF with custom rules
- Image optimization (Polish)
- Mobile optimization (Mirage)
- More page rules

## Contact Support

If you encounter issues:
1. Check Cloudflare System Status
2. Review Cloudflare Community forums
3. Contact Cloudflare support (Pro plan and above)

## Next Steps

After Cloudflare is configured:

1. Test all application features
2. Monitor performance metrics
3. Set up alerts for downtime
4. Document any custom configurations
5. Plan for scaling if needed

Remember to regularly:
- Update Cloudflare IP ranges in nginx config: `./deploy.sh update-ips`
- Review security events and adjust rules
- Monitor bandwidth and optimize caching