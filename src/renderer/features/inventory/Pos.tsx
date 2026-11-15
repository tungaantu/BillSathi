import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Minus, Pause, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  EmptyState,
  HelpTip,
  IconButton,
  Input,
  Kbd,
  MoneyInput,
  MoneyText,
  Select,
  useToast,
} from '../../components/ui';
import { useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import { today } from '../../../shared/masters';
import { formatINR } from '../../../shared/money';
import { blankDocument, totals, type SaleDocument } from '../../../shared/sales';
import { customerLine } from '../../../shared/customer-features';
import { findByCode, type PosPart, type PosMethod } from '../../../shared/inventory';
import { useCustomerRates } from '../customers/common';
import { useSales } from '../sales/common';
import { PosPay } from './PosPay';

interface CartLine {
  itemId: number;
  qty: number;
  /** Line discount in paise. */
  discount: number;
}
interface Held {
  id: number;
  at: string;
  partyId: number | null;
  cart: CartLine[];
}
const heldKey = (firm: number) => `billsathi.pos.held.${firm}`;
function loadHeld(firm: number): Held[] {
  try {
    return JSON.parse(localStorage.getItem(heldKey(firm)) ?? '[]') as Held[];
  } catch {
    return [];
  }
}
function storeHeld(firm: number, held: Held[]) {
  try {
    localStorage.setItem(heldKey(firm), JSON.stringify(held));
  } catch {
    /* held bills stay in memory only */
  }
}

export function Pos() {
  const { t } = useTranslation(),
    { firmId, firm, items, parties, accounts, settings, lookups, invalidate, error } = useSales(),
    { navigate } = useNavigation(),
    toast = useToast(),
    rates = useCustomerRates();
  const [cart, setCart] = useState<CartLine[]>([]),
    [partyId, setPartyId] = useState<number | null>(null),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState<number | null>(null),
    [paying, setPaying] = useState<PosMethod | 'split' | null>(null),
    [held, setHeld] = useState<Held[]>(() => loadHeld(firmId)),
    [recall, setRecall] = useState(false),
    [summary, setSummary] = useState(false),
    [active, setActive] = useState(0),
    [busy, setBusy] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);
  const products = items;
  const party = parties.find((p) => p.id === partyId);
  const tax = useCallback(
    (taxRateId: number | null) =>
      settings.gst ? (lookups.taxes.find((x) => x.id === taxRateId)?.rateBps ?? 0) : 0,
    [settings.gst, lookups.taxes],
  );
  const doc: SaleDocument = useMemo(() => {
    const base = blankDocument('sale', firm!.stateCode, settings);
    const head = {
      ...base,
      cash: !partyId,
      partyId,
      partyName: party?.name ?? '',
      phone: party?.phone ?? '',
      billingAddress: party?.billingAddress ?? '',
      placeOfSupply: party?.stateCode || firm!.stateCode,
      date: today(),
      description: t('pos.title'),
    };
    const lines = cart.flatMap((c) => {
      const item = items.find((i) => i.id === c.itemId);
      if (!item) return [];
      const line = customerLine(head, item, tax(item.taxRateId), rates.data ?? [], settings, c.qty);
      return [{ ...line, discountAmount: c.discount }];
    });
    return { ...head, lines };
  }, [cart, partyId, party, items, firm, settings, rates.data, tax, t]);
  const calc = useMemo(() => (doc.lines.length ? totals(doc, firm!.stateCode) : null), [doc, firm]);
  const total = calc?.total ?? 0;

  const add = useCallback(
    (itemId: number, qty = 1) => {
      setCart((c) => {
        const at = c.findIndex((l) => l.itemId === itemId);
        if (at >= 0) {
          setActive(at);
          return c.map((l, i) => (i === at ? { ...l, qty: l.qty + qty } : l));
        }
        setActive(c.length);
        return [...c, { itemId, qty, discount: 0 }];
      });
    },
    [setCart],
  );
  const scan = useCallback(
    (text: string) => {
      const item = findByCode(products, text);
      if (item) {
        add(item.id);
        setSearch('');
      } else toast(t('pos.notFound', { code: text }), { error: true });
    },
    [products, add, toast, t],
  );
  const setQty = (index: number, qty: number) =>
    setCart((c) =>
      qty <= 0
        ? c.filter((_, i) => i !== index)
        : c.map((l, i) => (i === index ? { ...l, qty } : l)),
    );
  const hold = useCallback(() => {
    if (!cart.length) return;
    const next = [...held, { id: Date.now(), at: new Date().toISOString(), partyId, cart }];
    setHeld(next);
    storeHeld(firmId, next);
    setCart([]);
    setPartyId(null);
    toast(t('pos.held'));
  }, [cart, held, partyId, firmId, toast, t]);
  // Function keys for the counter: F2 search, F4 quantity, F8 pay, F9 hold, Esc leave.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (e.key === 'F2') {
        e.preventDefault();
        searchBox.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(`[data-pos-qty="${active}"]`)?.select();
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (cart.length) setPaying('cash');
      } else if (e.key === 'F9') {
        e.preventDefault();
        hold();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Never lose a bill: an unfinished cart is put on hold before leaving.
        hold();
        navigate('invoices');
      }
    };
    // Capture phase: runs before a dialog's own Escape handler closes it, so the check above holds.
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, [active, cart.length, hold, navigate]);
  useEffect(() => searchBox.current?.focus(), []);

  async function finish(parts: PosPart[], change: number) {
    setBusy(true);
    try {
      const account = (m: PosMethod) => accounts.find((a) => a.type === m)?.id;
      const payments = parts.map((p) => ({
        accountId: account(p.method) ?? account('cash')!,
        amount: p.amount,
        reference: 'POS',
      }));
      const number = unwrap(await window.api.sales.next(firmId, 'sale', doc.prefix));
      const saved = unwrap(await window.api.sales.save(firmId, null, { ...doc, number, payments }));
      setPaying(null);
      setCart([]);
      setPartyId(null);
      await invalidate();
      toast(
        change > 0
          ? t('pos.savedChange', { number: saved.number, change: formatINR(change) })
          : t('pos.saved', { number: saved.number }),
      );
      if (settings.posAutoPrint)
        await window.api.sales.output(firmId, saved.id, 'thermal').then(unwrap).catch(error);
      searchBox.current?.focus();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  const categories = lookups.categories;
  const tiles = products
    .filter((i) => category === null || i.categoryId === category)
    .filter((i) =>
      `${i.name} ${i.code} ${i.barcode ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .slice(0, 120);
  return (
    <div className="pos" aria-label={t('pos.title')}>
      <header className="pos-bar">
        <Button variant="ghost" onClick={() => navigate('invoices')}>
          <ArrowLeft size={16} /> {t('pos.exit')} <Kbd>Esc</Kbd>
        </Button>
        <h1>
          {t('pos.title')} <HelpTip id="pos-mode" />
        </h1>
        <div className="button-row">
          <Button variant="secondary" disabled={!held.length} onClick={() => setRecall(true)}>
            <RotateCcw size={16} /> {t('pos.recall', { count: held.length })}
          </Button>
          <Button variant="secondary" onClick={() => setSummary(true)}>
            {t('pos.summary')}
          </Button>
        </div>
      </header>
      <div className="pos-body">
        <section className="pos-products" data-tour="pos-search">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (search.trim()) scan(search);
            }}
          >
            <Input
              ref={searchBox}
              data-scan
              aria-label={t('pos.search')}
              placeholder={t('pos.searchHint')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <div className="pos-chips" role="group" aria-label={t('pos.categories')}>
            <button className={category === null ? 'active' : ''} onClick={() => setCategory(null)}>
              {t('pos.all')}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={category === c.id ? 'active' : ''}
                onClick={() => setCategory(c.id)}
              >
                {t(`category.${c.name}`, { defaultValue: c.name })}
              </button>
            ))}
          </div>
          {!tiles.length ? (
            <EmptyState
              title={t('pos.noProducts')}
              description={t('pos.noProductsBody')}
              action={t('masters.newItem')}
              onAction={() => navigate('items/new')}
            />
          ) : (
            <div className="pos-tiles">
              {tiles.map((i) => (
                <button key={i.id} className="pos-tile" onClick={() => add(i.id)}>
                  {i.image ? (
                    <img src={i.image} alt="" />
                  ) : (
                    <span className="pos-initial">{i.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  <strong>{i.name}</strong>
                  <span>{formatINR(i.salePrice)}</span>
                  {i.type !== 'service' && (
                    <small className={i.qty <= 0 ? 'out' : ''}>
                      {t('pos.stock', { qty: i.qty })}
                    </small>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
        <aside className="pos-cart" data-tour="pos-cart">
          <Select
            label={t('pos.customer')}
            value={String(partyId ?? '')}
            options={[
              { value: '', label: t('pos.walkIn') },
              ...parties.map((p) => ({ value: String(p.id), label: `${p.name} ${p.phone}` })),
            ]}
            onChange={(v) => setPartyId(Number(v) || null)}
          />
          <div className="pos-lines">
            {!cart.length ? (
              <p className="muted pos-empty">{t('pos.emptyCart')}</p>
            ) : (
              cart.map((c, i) => {
                const item = items.find((x) => x.id === c.itemId);
                return (
                  <div
                    key={c.itemId}
                    className={`pos-line ${i === active ? 'active' : ''}`}
                    onClick={() => setActive(i)}
                  >
                    <div className="pos-line-name">
                      <strong>{item?.name}</strong>
                      <MoneyText value={calc?.lines[i]?.total ?? 0} />
                    </div>
                    <div className="pos-line-controls">
                      <IconButton label={t('pos.less')} onClick={() => setQty(i, c.qty - 1)}>
                        <Minus size={16} />
                      </IconButton>
                      <Input
                        data-pos-qty={i}
                        aria-label={`${t('pos.qty')} ${item?.name}`}
                        type="number"
                        min="0"
                        step="0.001"
                        value={c.qty}
                        onChange={(e) => setQty(i, Number(e.target.value))}
                      />
                      <IconButton label={t('pos.more')} onClick={() => setQty(i, c.qty + 1)}>
                        <Plus size={16} />
                      </IconButton>
                      <MoneyInput
                        aria-label={`${t('pos.discount')} ${item?.name}`}
                        value={c.discount}
                        onValueChange={(v) =>
                          setCart((all) => all.map((l, j) => (j === i ? { ...l, discount: v } : l)))
                        }
                      />
                      <IconButton label={t('sales.remove')} onClick={() => setQty(i, 0)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="pos-totals">
            <span>{t('pos.taxable')}</span>
            <MoneyText value={calc?.taxable ?? 0} />
            <span>{t('pos.tax')}</span>
            <MoneyText
              value={(calc?.cgst ?? 0) + (calc?.sgst ?? 0) + (calc?.igst ?? 0) + (calc?.cess ?? 0)}
            />
            <strong>{t('pos.total')}</strong>
            <strong className="pos-grand">
              <MoneyText value={total} />
            </strong>
          </div>
          <div className="pos-actions" data-tour="pos-pay">
            {(['cash', 'upi', 'card', 'split'] as const).map((m) => (
              <Button
                key={m}
                variant={m === 'cash' ? 'primary' : 'secondary'}
                disabled={!cart.length || busy}
                onClick={() => setPaying(m)}
              >
                {t(`pos.method.${m}`)}
                {m === 'cash' && <Kbd>F8</Kbd>}
              </Button>
            ))}
            <Button variant="ghost" disabled={!cart.length} onClick={hold}>
              <Pause size={16} /> {t('pos.hold')} <Kbd>F9</Kbd>
            </Button>
          </div>
          <p className="muted small">{t('pos.keys')}</p>
        </aside>
      </div>
      {paying && (
        <PosPay
          total={total}
          initial={paying}
          onClose={() => setPaying(null)}
          onPaid={(parts, change) => void finish(parts, change)}
        />
      )}
      {recall && (
        <Dialog open onOpenChange={setRecall} title={t('pos.recallTitle')}>
          <ul className="stack">
            {held.map((h) => (
              <li key={h.id} className="pos-held">
                <span>
                  {new Date(h.at).toLocaleTimeString()} ·{' '}
                  {parties.find((p) => p.id === h.partyId)?.name ?? t('pos.walkIn')} ·{' '}
                  {t('pos.items', { count: h.cart.length })}
                </span>
                <Button
                  onClick={() => {
                    if (cart.length) hold();
                    setCart(h.cart);
                    setPartyId(h.partyId);
                    const next = held.filter((x) => x.id !== h.id);
                    setHeld(next);
                    storeHeld(firmId, next);
                    setRecall(false);
                  }}
                >
                  {t('pos.open')}
                </Button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {summary && <PosSummary onClose={() => setSummary(false)} />}
    </div>
  );
}

function PosSummary({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    { firmId } = useSales();
  const day = useQuery({
    queryKey: ['posDay', firmId],
    queryFn: async () => unwrap(await window.api.inventory.posDay(firmId)),
  });
  const d = day.data;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={t('pos.summaryTitle')}>
      <dl className="pos-summary">
        <dt>{t('pos.bills')}</dt>
        <dd>{d?.bills ?? 0}</dd>
        {(['cash', 'upi', 'card'] as const).map((m) => (
          <div key={m} className="contents">
            <dt>{t(`pos.method.${m}`)}</dt>
            <dd>
              <MoneyText value={d?.[m] ?? 0} />
            </dd>
          </div>
        ))}
        <dt>
          <strong>{t('pos.total')}</strong>
        </dt>
        <dd>
          <strong>
            <MoneyText value={d?.total ?? 0} />
          </strong>
        </dd>
      </dl>
    </Dialog>
  );
}
