import { BrowserWindow, screen } from 'electron';
import { escapeHtml } from '../../../shared/invoice-html';
import { formatINR } from '../../../shared/money';
import { payments } from '../../../renderer/i18n/modules/payments';
import type { CollectionView } from '../../../shared/payments-api';

const windows = new Map<number, BrowserWindow>();

/** HTML for the customer-facing window: only the QR, the amount and the payee. */
export function displayHtml(
  c: Pick<CollectionView, 'qr' | 'amount' | 'payeeName' | 'upiId' | 'invoiceLabel' | 'expiresAt'>,
  labels: Record<string, string>,
): string {
  const e = escapeHtml;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>${e(labels['payments.display.title'])}</title>
<style>
html,body{margin:0;height:100%;font-family:'Segoe UI',Inter,system-ui,sans-serif;background:#f5f7fb;color:#0f172a}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;box-sizing:border-box;text-align:center}
img{width:min(62vh,80vw);height:min(62vh,80vw);background:#fff;padding:14px;border-radius:16px;box-shadow:0 6px 28px rgba(15,23,42,.12)}
.amount{font-size:clamp(36px,8vh,72px);font-weight:800;letter-spacing:-.02em}
.muted{color:#64748b;font-size:clamp(14px,2.4vh,22px)}
.pill{padding:8px 18px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-weight:600;font-size:clamp(14px,2.4vh,22px)}
body.paid .pill{background:#dcfce7;color:#15803d}
body.paid img{opacity:.15}
</style></head><body><main>
<div class="muted">${e(labels['payments.display.pay'])} ${e(c.payeeName)}</div>
<div class="amount">${e(formatINR(c.amount))}</div>
<img alt="UPI QR" src="${e(c.qr)}">
<div class="muted">${e(labels['payments.display.scan'])} · ${e(c.upiId)} · ${e(c.invoiceLabel)}</div>
<div class="pill" id="state">${e(labels['payments.display.waiting'])} <span id="left"></span></div>
</main><script>
const end=${JSON.stringify(c.expiresAt)};
const waiting=${JSON.stringify(labels['payments.display.waiting'])};
const timer=setInterval(()=>{const s=Math.max(0,Math.round((Date.parse(end)-Date.now())/1000));
document.getElementById('left').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');if(!s)clearInterval(timer)},500);
window.setPaid=(text)=>{clearInterval(timer);document.body.className='paid';document.getElementById('state').textContent=text};
window.setWaiting=()=>{document.body.className='';document.getElementById('state').innerHTML=waiting+' <span id="left"></span>'};
</script></body></html>`;
}

/** Shows the QR on the customer's side: the non-primary display, or the main one if there is only one. */
export async function openCustomerDisplay(c: CollectionView, language: string): Promise<boolean> {
  closeCustomerDisplay(c.id);
  const labels = language === 'hi' ? payments.hi : payments.en;
  const primary = screen.getPrimaryDisplay();
  const target = screen.getAllDisplays().find((d) => d.id !== primary.id) ?? primary;
  const window = new BrowserWindow({
    x: target.workArea.x,
    y: target.workArea.y,
    width: Math.min(900, target.workArea.width),
    height: Math.min(900, target.workArea.height),
    title: labels['payments.display.title'],
    autoHideMenuBar: true,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  windows.set(c.id, window);
  window.on('closed', () => windows.delete(c.id));
  await window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(displayHtml(c, labels))}`,
  );
  if (target.id !== primary.id) window.maximize();
  window.show();
  return true;
}

export function updateCustomerDisplay(id: number, paid: boolean, language: string) {
  const window = windows.get(id);
  if (!window || window.isDestroyed()) return;
  const labels = language === 'hi' ? payments.hi : payments.en;
  void window.webContents
    .executeJavaScript(
      paid
        ? `window.setPaid(${JSON.stringify(labels['payments.display.thanks'])})`
        : 'window.setWaiting()',
    )
    .catch(() => {});
}

export function closeCustomerDisplay(id: number) {
  const window = windows.get(id);
  windows.delete(id);
  if (window && !window.isDestroyed()) window.close();
}
