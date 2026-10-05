# Deployment guide

## Stage 1 — Demo on GitHub Pages (now)
The repository is a plain static site, so GitHub Pages can host the demo directly.

1. Repository → **Settings → Pages** → *Source: Deploy from a branch* → **main** / **(root)** → Save.
2. After ~1 minute the demo is live at `https://rudawathegw-design.github.io/MyFitness/`
   - Customer menu: `…/MyFitness/?t=L3`
   - Staff panel: `…/MyFitness/admin/`
   - Presentation: `…/MyFitness/demo.html`

> GitHub Pages is free for **public** repositories. For a private repository it needs a paid GitHub plan
> (Pro/Team). In demo mode each browser keeps its own data — perfect for showing the owner.

## Stage 2 — The real café (Windows PC in the gym)
1. Install **Node.js LTS** on the café PC and copy (or `git clone`) this folder to it.
2. Double-click **`start-server.bat`** (put a shortcut in the Windows *Startup* folder so it starts with the PC).
3. Router: reserve a fixed IP for the PC (e.g. `192.168.1.10`) and for the printer.
4. Staff panel → **Settings → Public menu link** → `http://192.168.1.10:8080/` → **Tables & QR → Print QR cards**.
5. Customers on the gym Wi-Fi scan and order; the kitchen PC runs **`start-kitchen.bat`**.

Data: `data/` folder (JSON + photos). Daily backups: `data/backups/`. Copy the `data` folder to move or back up
everything. *Settings → Download backup* exports everything as one JSON file.

## Stage 3 — Your Cloudflare domain (after the demo is accepted)
Goal: customers can order **from mobile data too**, at a nice address like `https://order.myfitness.example`,
while printing stays local in the gym.

### Recommended: Cloudflare Tunnel (free, no router port-forwarding, automatic HTTPS)
1. Buy/add the domain in Cloudflare.
2. On the café PC install **cloudflared**: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>
3. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create tunnel** → follow the Windows install command
   (installs cloudflared as a Windows service).
4. Add a **Public hostname**: `order.yourdomain.com` → Service **HTTP** → `localhost:8080`.
5. Staff panel → Settings → **Public menu link** → `https://order.yourdomain.com/` and reprint the QR cards.

Now the same server is reachable inside the gym and from anywhere, over HTTPS. The server keeps printing directly to
the XP-N200L on the LAN. (Optional: protect `/admin/*` with **Cloudflare Access** so only staff emails can open it.)

### Alternative: keep the static demo on your domain
GitHub repository → Settings → Pages → **Custom domain** `menu.yourdomain.com`, and in Cloudflare DNS add a
`CNAME menu → rudawathegw-design.github.io`. (This is still demo mode — use the Tunnel for real orders.)

### Later: fully cloud-hosted
`js/core/service.js` contains all business rules and runs anywhere JavaScript runs. It can be moved to
**Cloudflare Workers + D1/Durable Objects** without changing the customer or staff apps; printing would then use the
local print bridge (`start-print-bridge.bat`) on the café PC.

## Server options
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Web port |
| `HOST` | `0.0.0.0` | Listen address |
| `DATA_DIR` | `./data` | Where orders, staff, settings and photos are stored |
| `DEMO=1` / `--demo` | off | Sample sales + demo login buttons |
| `TRUST_PROXY=1` | off | Read client IPs from `X-Forwarded-For` (behind a proxy) |

Print bridge: `BRIDGE_PORT` (9123), `BRIDGE_HOST` (127.0.0.1), `BRIDGE_KEY` (optional shared secret — enter the same
key in Staff panel → Printer).
