// Raw ESC/POS printing for the Xprinter XP-N200L (and any ESC/POS printer).
//   • network: TCP port 9100 on the printer's LAN IP (factory default 192.168.123.100)
//   • windows: any installed Windows printer (USB) via the spooler in RAW mode
// No dependencies — uses Node's net module and PowerShell (built into Windows).
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const isWin = process.platform === 'win32';
const HOST_RE = /^[a-zA-Z0-9.-]{1,253}$/;
const PRINTER_RE = /^[\w\s().,#@&+\\/:-]{1,120}$/;

export function sendNetwork(host, port = 9100, bytes, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!HOST_RE.test(String(host || ''))) return reject(new Error('invalid printer IP'));
    port = Number(port) || 9100;
    if (port < 1 || port > 65535) return reject(new Error('invalid port'));
    const sock = net.createConnection({ host, port });
    let done = false;
    const finish = (err) => { if (done) return; done = true; sock.destroy(); err ? reject(err) : resolve(true); };
    sock.setTimeout(timeout, () => finish(new Error(`printer ${host}:${port} did not answer (timeout)`)));
    sock.on('error', (e) => finish(new Error(`printer ${host}:${port} — ${e.code || e.message}`)));
    sock.on('connect', () => { sock.end(Buffer.from(bytes), () => setTimeout(() => finish(), 150)); });
  });
}

export function tcpCheck(host, port = 9100, timeout = 2500) {
  return new Promise((resolve) => {
    if (!HOST_RE.test(String(host || ''))) return resolve(false);
    const sock = net.createConnection({ host, port: Number(port) || 9100 });
    const end = (ok) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeout, () => end(false));
    sock.on('error', () => end(false));
    sock.on('connect', () => end(true));
  });
}

const PS_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$code = @"
using System;
using System.Runtime.InteropServices;
public static class MfRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  public static int Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return Marshal.GetLastWin32Error();
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "MY FITNESS ticket";
      di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return Marshal.GetLastWin32Error();
      StartPagePrinter(h);
      int written;
      bool ok = WritePrinter(h, data, data.Length, out written);
      EndPagePrinter(h);
      EndDocPrinter(h);
      return ok ? 0 : Marshal.GetLastWin32Error();
    } finally { ClosePrinter(h); }
  }
}
"@
if (-not ([System.Management.Automation.PSTypeName]'MfRawPrint').Type) { Add-Type -TypeDefinition $code }
$bytes = [System.IO.File]::ReadAllBytes($env:MF_FILE)
$r = [MfRawPrint]::Send($env:MF_PRINTER, $bytes)
if ($r -ne 0) { [Console]::Error.WriteLine("Windows spooler error $r (is the printer name exactly right?)"); exit 2 }
`;
let psFile = null;
function scriptPath() {
  if (!psFile) {
    psFile = path.join(os.tmpdir(), 'myfitness-rawprint.ps1');
    fs.writeFileSync(psFile, PS_SCRIPT, 'utf8');
  }
  return psFile;
}
export function sendWindows(printer, bytes) {
  return new Promise((resolve, reject) => {
    if (!isWin) return reject(new Error('Windows printers are only available when this runs on Windows — use the LAN IP instead'));
    if (!PRINTER_RE.test(String(printer || ''))) return reject(new Error('invalid Windows printer name'));
    const file = path.join(os.tmpdir(), `myfitness-${crypto.randomBytes(6).toString('hex')}.bin`);
    fs.writeFileSync(file, Buffer.from(bytes));
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath()], {
      env: { ...process.env, MF_FILE: file, MF_PRINTER: printer }, timeout: 30000, windowsHide: true,
    }, (err, stdout, stderr) => {
      fs.unlink(file, () => {});
      if (err) reject(new Error((stderr || err.message || 'print failed').trim().split('\n')[0]));
      else resolve(true);
    });
  });
}

export function listPrinters() {
  return new Promise((resolve) => {
    if (!isWin) return resolve([]);
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'], { timeout: 15000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    });
  });
}

/** target: { type:'network', host, port } | { type:'windows', printer } */
export async function sendToPrinter(target, bytes) {
  if (!bytes || !bytes.length) throw new Error('nothing to print');
  if (bytes.length > 4 * 1024 * 1024) throw new Error('print job too large');
  if (target?.type === 'windows') return sendWindows(target.printer, bytes);
  return sendNetwork(target?.host, target?.port || 9100, bytes);
}
