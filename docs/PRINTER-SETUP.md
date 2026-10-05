# Printer setup — Xprinter XP-N200L

**Printer:** Xprinter XP-N200L thermal receipt printer · 80 mm paper (576 dots per line) · 200 mm/s ·
interfaces **USB + LAN (Ethernet)** · supports **ESC/POS** commands · cash-drawer port (24 V / 1 A, RJ-11).

The staff panel supports three ways to print. Pick one in **Staff panel → Printer → Connection**.

| Mode | Best for | Needs |
|---|---|---|
| **Windows driver** | Simplest. Any Windows PC with the printer on USB or LAN | Xprinter driver installed |
| **Print bridge — silent** | Fastest, no dialogs, perfect Kurdish/Arabic, cash drawer | `start-server.bat` *or* `start-print-bridge.bat` running on the PC next to the printer |
| **Android tablet** | Kitchen uses an Android tablet | Free **RawBT** app on the tablet |

---

## A. Windows driver (recommended to start)
1. Connect the printer by USB (or LAN) and install the **Xprinter driver** from the CD or <https://www.xprintertech.com>.
2. In Windows *Printers & scanners* open the printer → **Printing preferences** → paper **80 mm (72 mm printable)**,
   and print a **test page**.
3. Make it the **default printer**.
4. Staff panel → Printer → **Windows driver** → press **Test print**. In the print dialog choose the Xprinter,
   *Margins: None*, *Scale: 100 %*.
5. **Silent printing (no dialog):** start the kitchen PC with **`start-kitchen.bat`**. It opens Chrome/Edge with
   `--kiosk-printing`, so tickets print immediately on the default printer and sound alerts work without a click.
6. On that PC switch on **Print station** (top bar) → new and scheduled orders print automatically.

## B. Print bridge — silent ESC/POS (LAN or USB)
The bridge sends raw ESC/POS bytes straight to the printer.

**If you run the server (`start-server.bat`)**, the server itself is the bridge — nothing else to install.

**If the staff panel is opened online** (GitHub Pages / your domain), run **`start-print-bridge.bat`** on the PC next
to the printer and keep its window open. The panel talks to it at `http://127.0.0.1:9123`. (Chrome may ask once to
allow access to devices on your local network — click *Allow*.)

Then in Staff panel → Printer:
- **Print bridge — silent**
- *Send to* → **Printer on network (LAN)** and enter the printer IP, port **9100**
  — or — **Windows printer (USB)** and type the Windows printer name exactly (press *Check connection* to list names)
- *Ticket format* → **Image** (prints Kurdish, Arabic, logo and QR) or **Text** (fastest, English only)
- **Check connection** → **Test print**

### Find / set the printer's IP address (LAN)
- Switch the printer **off**, hold **FEED**, switch it **on** and release after ~2 s → it prints a self-test page with
  its IP. The factory default is usually **192.168.123.100**.
- To give it an address in your router's range (e.g. `192.168.1.200`), use Xprinter's *Printer Tool / NetSet*
  utility from the CD/website, or temporarily set the PC to `192.168.123.x` and open the printer's web page.
- Reserve that IP in the router so it never changes.

## C. Android tablet (RawBT)
Install **RawBT** from Google Play, add the XP-N200L (network IP or USB-OTG) inside RawBT, then in Staff panel →
Printer choose **Android tablet**. Prints go through RawBT automatically.

---

## What gets printed
- **Kitchen ticket:** big order number, table + floor (or PICKUP), scheduled time, customer name, items with options,
  notes highlighted. No prices.
- **Customer receipt:** logo, café name & phone, items with prices, service/tax, **total in IQD**, payment status,
  QR code to track the order, footer text.
- Settings: copies, which tickets to print automatically, paper cut, **open cash drawer** for paid cash orders
  (plug the drawer into the printer's RJ-11 port), receipt logo (red MY FITNESS or yellow Ladies), ticket language
  (English, Kurdish, Arabic or English + Kurdish), header/footer text in three languages.

## Troubleshooting
| Problem | Fix |
|---|---|
| Print dialog appears every time | Use `start-kitchen.bat` (kiosk printing) or the Print bridge mode |
| Nothing prints in bridge mode | Is `start-server.bat` / `start-print-bridge.bat` running? Press *Check connection* |
| “did not answer (timeout)” | Wrong IP, printer off, or PC on another network. Ping the IP from the PC |
| “Windows spooler error 1801” | The Windows printer name is not exact — copy it from *Check connection* |
| Kurdish/Arabic shows `?` | Switch *Ticket format* to **Image** |
| Tickets print twice | Only one PC should have **Print station** switched on |
