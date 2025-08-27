Dev networking tips

- Frontend runs at `http://localhost:5174` (Vite).
- API listens on `http://0.0.0.0:8787` (Fastify).
- Health check is at `GET /healthz`.

Local and LAN access

- By default, the server now allows CORS from:
  - `http://localhost:5174`, `http://127.0.0.1:5174`, and `http://[::1]:5174`.
  - Any private LAN IPv4 on the Vite port (e.g., `http://192.168.x.y:5174`, `http://10.x.y.z:5174`) when `CORS_ORIGIN` is unset.
- To be strict (e.g., in prod), set `CORS_ORIGIN` to a comma‑separated allowlist, like:

```
CORS_ORIGIN=http://localhost:5174,https://studio.my-domain.com
```

Configuring the web client

- The app auto‑detects the API base URL in dev. For mobile/LAN testing, you can override:
  - At build time via `web/.env`:
    - `VITE_API_BASE_URL=http://<your-ip>:8787`
  - At runtime via URL param:
    - `http://<your-ip>:5174/?api=http://<your-ip>:8787`

Troubleshooting

- Disconnected status in the UI usually means:
  - API not running on port 8787
  - Wrong `VITE_API_BASE_URL` or LAN IP
  - CORS blocked (set `CORS_ORIGIN` or use a private LAN origin on port 5174)
