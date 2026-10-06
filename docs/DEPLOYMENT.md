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

## Stage 1b — Live cloud link through the browser (no software on any PC)
Use this to test with real phones on mobile data: every phone, the kitchen screen and the staff panel share the
same live orders. Everything is done in the browser — nothing is installed on your laptop.

1. Open <https://render.com> → **Get started** → sign up with your **GitHub** account.
2. Render dashboard → **New → Blueprint** → choose the **MyFitness** repository (allow Render to read it).
3. Render reads `render.yaml` and asks for **STAFF_PASSWORD** → type a password (6+ characters). It becomes the
   password for the staff accounts `admin`, `manager`, `cashier` and `kitchen`.
4. Press **Apply** and wait ~2–3 minutes → you get a link like `https://myfitness-xxxx.onrender.com`.
   - Customer menu: `https://myfitness-xxxx.onrender.com/?t=L3`
   - Staff panel: `https://myfitness-xxxx.onrender.com/admin/`
   - Tables & QR: the QR codes automatically point to the onrender.com link.

Free plan limits: the service **sleeps after ~15 minutes without visitors** (the next visit takes up to a minute to
wake up), and its storage is temporary — orders and uploaded photos are reset when it sleeps, restarts or redeploys
(sample data comes back automatically). Perfect for testing and the owner demo; for the real café use Stage 2 or a
paid plan with a persistent disk.

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
| `DEMO=1` / `--demo` | off | Sample sales (+ one-tap demo logins when no `STAFF_PASSWORD` is set) |
| `STAFF_PASSWORD` | – | Password for the starting staff accounts; set it whenever the server is public |
| `TRUST_PROXY=1` | off | Read client IPs from `X-Forwarded-For` (behind a proxy) |

Print bridge: `BRIDGE_PORT` (9123), `BRIDGE_HOST` (127.0.0.1), `BRIDGE_KEY` (optional shared secret — enter the same
key in Staff panel → Printer).
