# MY FITNESS — QR ordering system · Ranya

End-to-end food ordering for the **MY FITNESS** café (Ladies floor) in Ranya, Kurdistan Region.
Customers scan the QR code on their table, order from their phone — **now or scheduled for later** — and the
kitchen receives the order instantly with a sound alert and a printed ticket on the **Xprinter XP-N200L**.

| | |
|---|---|
| **Customer menu** (mobile) | `index.html` — open with `?t=L5` to preselect a table |
| **Staff panel** (Windows PC) | `admin/` — orders, kitchen screen, counter POS, menu, QR codes, analytics, printer, staff |
| **Demo presentation** | `demo.html` — phone + kitchen screen side by side |

**Demo logins:** `admin / admin123` (owner) · `manager / manager123` · `cashier / cashier123` · `kitchen / kitchen123`
— change them in **Staff** before real use.

---

## Features

**Customers (phone, no app, no account)**
- QR per table → menu opens with the table already chosen (both floors supported)
- Kurdish (Sorani), Arabic and English, full right-to-left layout; white mode by default, dark mode toggle
- Photos, descriptions, calories & protein, tags (popular / high protein / vegetarian / new), sold-out state
- Fitness filters (high protein, under 400 kcal, vegetarian), search, “Coach’s picks”
- Options & add-ons (size, milk, extra shot, whey scoop, crust…), notes for the kitchen, macro totals in the cart
- Checkout: **name + mobile required** (Iraqi 07XX numbers, Kurdish/Arabic digits accepted), **Now or Later**
  (pick a day and time slot), table service or counter pickup, cash / card (FIB & FastPay ready to enable)
- Live order tracking (Scheduled → Received → Preparing → Ready → Completed) with sound and vibration
- “Call staff” button (waiter / bill / water), order again, order history on the phone
- All prices in **IQD**

**Staff (Windows PC first, also tablets & phones)**
- Login with roles: owner, manager, cashier, kitchen (each sees only what they need) + activity log
- Live orders board and full-screen **kitchen screen**: new-order alarm that repeats until accepted, desktop
  notifications, timers that turn amber/red, tap items to tick them off
- **Scheduled orders** are released to the kitchen automatically (default 15 min before their time)
- Counter **POS** for walk-in customers (keyboard friendly, cash drawer support)
- Menu manager: categories, items, prices, three languages, nutrition, options builder, sold-out switch,
  **photo upload** (drag & drop from File Explorer, paste with Ctrl+V, crop & zoom, auto-compress)
- Tables & QR: print A4 sheets of table cards (Kurdish/Arabic/English) or download PNGs
- **Analytics**: revenue, orders, average order, prep time, cancel rate (vs previous period), revenue trend,
  busiest hours, weekday × hour heatmap, best sellers, category / payment / order-type / floor mix,
  automatic insights, CSV export
- Settings: opening hours, pause ordering, scheduling rules, payment methods, service charge, backups

**Printing — Xprinter XP-N200L (80 mm, USB + LAN, ESC/POS)**
- *Windows driver* mode: prints through the installed driver (works on any PC; silent with `start-kitchen.bat`)
- *Print bridge* mode: raw ESC/POS to the LAN IP (port 9100) or the USB Windows printer — no dialogs
- *Android* mode via the RawBT app
- Kitchen tickets and customer receipts with logo, big order number, table, notes and a tracking QR;
  image mode prints Kurdish & Arabic perfectly · cash-drawer kick · copies · paper cut · live preview

---

## Two ways to run it

### 1) Online demo (GitHub Pages) — zero setup
Everything runs in the browser and data is stored **in that browser only** (each device has its own demo data).
Perfect to show the owner: open `demo.html`, place an order on the phone frame, watch it arrive on the kitchen screen.
In demo mode the app fills itself with ~70 days of realistic sample sales so the analytics look alive.

### 2) Real café mode (Windows server) — all devices share live data
1. Install **Node.js LTS** from <https://nodejs.org> on the café PC (one time).
2. Double-click **`start-server.bat`**. The staff panel opens at `http://localhost:8080/admin/`.
   The window shows the Wi-Fi address for customers, e.g. `http://192.168.1.47:8080/`.
3. Staff panel → **Tables & QR → Print QR cards** and put one on every table.
4. Customers connect to the gym Wi-Fi and scan. Orders appear live on every staff screen.

`start-demo.bat` starts the same server with sample sales and demo logins (kept in `data-demo/`).
Data lives in `data/` (JSON files + uploaded photos) with automatic daily backups in `data/backups/`.

> Give the café PC a fixed IP address in your router so the QR codes never change.
> To let customers order on mobile data too, publish the server with your Cloudflare domain — see
> [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Printer setup (short version)
1. Install the Xprinter driver (CD or xprintertech.com) and print a Windows test page.
2. Staff panel → **Printer** → keep **Windows driver**, press **Test print**.
3. On the PC next to the printer, turn on **Auto-print new orders on this PC** (top bar → *Print station*).
4. For silent printing start the kitchen screen with **`start-kitchen.bat`**.

LAN cable instead of USB? Hold **FEED** while switching the printer on to print its IP
(factory default `192.168.123.100`), choose **Print bridge → Printer on network** and enter that IP.
Full guide: [docs/PRINTER-SETUP.md](docs/PRINTER-SETUP.md).

---

## Project structure
```
index.html            customer QR menu          admin/index.html   staff panel
demo.html             presentation page         manifest.webmanifest
css/                  base.css · menu.css · admin.css (white + dark themes)
js/core/              shared engine — service.js (business rules, used by browser AND server),
                      store.js, local-db.js, i18n.js (3 languages), seed.js (menu), receipt.js,
                      escpos.js, qr.js, charts.js, analytics.js, image.js, sound.js, icons.js
js/menu/app.js        customer app              js/admin/          staff app + views/
server/server.js      zero-dependency Node server (API, live updates, uploads, printing, backups)
server/print-bridge.js  local print bridge for the online version
server/printing.js    ESC/POS over LAN (TCP 9100) and USB (Windows spooler, RAW)
start-*.bat           Windows launchers          assets/brand  logos (header + thermal versions)
```
No build step and no npm packages — the server only needs Node.js 18+.

## Customising
- **Menu, prices (IQD), photos, options:** Staff panel → Menu. Sample photos come from Unsplash
  (free licence) — replace them with real photos of your food.
- **Opening hours, scheduling rules, payments, service charge:** Settings.
- **Café name, address, ticket header/footer, receipt logo:** Settings and Printer.

## Security notes
- Change all default passwords (Staff → Change my password).
- Prices are always recalculated on the server; customers can only read their own order (secret token).
- When the server is reachable from the internet, use HTTPS (Cloudflare Tunnel does this for you).

## Roadmap ideas
Online payment (FIB / FastPay), SMS or WhatsApp “order ready” messages, loyalty points for members,
stock tracking, delivery to the men’s floor reception, Cloudflare Workers hosting.

---
Built for MY FITNESS · Ranya · 0750 821 2524
