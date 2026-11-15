import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmDialog } from '../../components/ui';
import { useNavigation } from '../../app/state';
import { blankDocument, blankLine, type DocumentType } from '../../../shared/sales';
import { unwrap } from '../../../shared/types';
import { displayDocumentNumber } from '../../../shared/numbering';
import { useDrafts, routeType, salesRoute, type Draft } from './drafts';
import { useSales } from './common';
import { SalesList } from './SalesList';
import { TransactionEditor } from './TransactionEditor';
import { PaymentIn } from './PaymentIn';
import { InvoicePreview } from './InvoicePreview';
export function Sales() {
  const { t } = useTranslation(),
    { firm, firmId, settings, parties, error } = useSales(),
    { route, navigate } = useNavigation();
  const { tabs, put, remove } = useDrafts(),
    [close, setClose] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const ownTabs = tabs.filter((d) => d.firmId === firmId),
    parts = route.split('/');
  const type =
    parts[0] === 'paymentIn'
      ? 'payment_in'
      : parts[0] === 'paymentOut'
        ? 'payment_out'
        : routeType(route);
  const selected = ownTabs.find((d) => d.key === parts[2]);
  async function openNew(kind: DocumentType = type as DocumentType) {
    if (creating) return;
    setCreating(true);
    try {
      const doc = blankDocument(kind, firm!.stateCode, settings);
      if (['expense', 'other_income'].includes(kind))
        Object.assign(doc, {
          expenseMode: 'simple',
          lines: [{ ...blankLine(), name: t('sales.simpleAmount') }],
        });
      let number = unwrap(await window.api.sales.next(firmId, kind, doc.prefix));
      while (
        ownTabs.some(
          (d) => d.doc.type === kind && d.doc.prefix === doc.prefix && d.doc.number === number,
        )
      )
        number++;
      doc.number = number;
      const draft: Draft = {
        key: crypto.randomUUID(),
        firmId,
        id: null,
        doc,
        updatedAt: new Date().toISOString(),
      };
      put(draft);
      navigate(`${salesRoute(kind)}/draft/${draft.key}`);
    } catch (e) {
      error(e);
    } finally {
      setCreating(false);
    }
  }
  async function edit(id: number, mode: 'edit' | 'duplicate' | 'return') {
    try {
      if (['payment_in', 'payment_out'].includes(type)) {
        navigate(`${parts[0]}/${mode}/${id}`);
        return;
      }
      const saved = unwrap(await window.api.sales.get(firmId, id));
      const current = ownTabs.find((d) => d.id === id);
      if (mode === 'edit' && current) {
        navigate(`${salesRoute(current.doc.type)}/draft/${current.key}`);
        return;
      }
      const kind =
        mode === 'return'
          ? saved.type === 'purchase'
            ? 'purchase_return'
            : 'sale_return'
          : saved.type;
      const blank = blankDocument(kind, firm!.stateCode, settings);
      const doc =
        mode === 'edit'
          ? saved
          : {
              ...saved,
              type: kind,
              prefix: blank.prefix,
              number: unwrap(await window.api.sales.next(firmId, kind, blank.prefix)),
              date: blank.date,
              dueDate: '',
              payments: [],
              attachmentIds: [],
              refTxnId: mode === 'return' ? id : null,
            };
      const draft: Draft = {
        key: crypto.randomUUID(),
        firmId,
        id: mode === 'edit' ? id : null,
        original: mode === 'edit' ? saved : undefined,
        doc,
        updatedAt: new Date().toISOString(),
      };
      put(draft);
      navigate(`${salesRoute(kind)}/draft/${draft.key}`);
    } catch (e) {
      error(e);
    }
  }
  useEffect(() => {
    if (
      !['new', 'party'].includes(route.split('/')[1]) ||
      ['payment_in', 'payment_out'].includes(type)
    )
      return;
    const party =
      route.split('/')[1] === 'party'
        ? parties.find((p) => p.id === Number(route.split('/')[2]))
        : undefined;
    if (route.split('/')[1] === 'party' && !party) return;
    let active = true;
    const doc = blankDocument(type as DocumentType, firm!.stateCode, settings);
    if (['expense', 'other_income'].includes(type))
      Object.assign(doc, {
        expenseMode: 'simple',
        lines: [{ ...blankLine(), name: t('sales.simpleAmount') }],
      });
    if (party)
      Object.assign(doc, {
        partyId: party.id,
        partyName: party.name,
        phone: party.phone,
        billingAddress: party.billingAddress,
        shippingAddress: party.shippingAddress,
        placeOfSupply: party.stateCode || firm!.stateCode,
      });
    void window.api.sales
      .next(firmId, type, doc.prefix)
      .then(unwrap)
      .then((next) => {
        if (!active) return;
        const existing = useDrafts.getState().tabs;
        while (
          existing.some(
            (d) =>
              d.firmId === firmId &&
              d.doc.type === type &&
              d.doc.prefix === doc.prefix &&
              d.doc.number === next,
          )
        )
          next++;
        doc.number = next;
        const key = crypto.randomUUID();
        put({ key, firmId, id: null, doc, updatedAt: new Date().toISOString() });
        navigate(`${salesRoute(type)}/draft/${key}`);
      })
      .catch(error);
    return () => {
      active = false;
    };
  }, [route, type, firm, firmId, settings, parties, put, navigate, error, t]);
  const newAction = () =>
    ['payment_in', 'payment_out'].includes(type) ? navigate(`${parts[0]}/new`) : void openNew();
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>{t(`nav.${parts[0]}`)}</h1>
          <p className="muted">{t('sales.intro')}</p>
        </div>
        <div className="toolbar" data-tour="sales-new">
          <Button variant="secondary" onClick={() => navigate(parts[0])}>
            {t('sales.backList')}
          </Button>
          <Button disabled={creating} onClick={newAction}>
            {t('sales.new')}
          </Button>
        </div>
      </div>
      {ownTabs.length > 0 && (
        <nav className="draft-tabs" aria-label={t('sales.drafts')}>
          {ownTabs.map((d) => (
            <div key={d.key} className={selected?.key === d.key ? 'active' : ''}>
              <Button
                variant="ghost"
                onClick={() => navigate(`${salesRoute(d.doc.type)}/draft/${d.key}`)}
              >
                {t(`sales.type.${d.doc.type}`)} · {displayDocumentNumber({ ...d.doc, firmId })}
              </Button>
              <Button
                variant="ghost"
                aria-label={t('sales.closeDraft')}
                onClick={() => setClose(d.key)}
              >
                {t('sales.closeTab')}
              </Button>
            </div>
          ))}
        </nav>
      )}
      {parts[1] === 'preview' ? (
        <InvoicePreview key={Number(parts[2])} id={Number(parts[2])} onNew={newAction} />
      ) : ['payment_in', 'payment_out'].includes(type) &&
        ['new', 'edit', 'duplicate'].includes(parts[1]) ? (
        <PaymentIn
          key={`${type}-${parts[1]}-${parts[2]}`}
          id={Number(parts[2]) || undefined}
          duplicate={parts[1] === 'duplicate'}
          type={type === 'payment_out' ? 'payment_out' : 'payment_in'}
        />
      ) : selected ? (
        <TransactionEditor
          key={selected.key}
          draft={selected}
          onNew={() => void openNew(selected.doc.type)}
        />
      ) : (
        <SalesList
          key={type}
          type={type}
          onNew={newAction}
          onEdit={(id, mode) => void edit(id, mode)}
        />
      )}
      <ConfirmDialog
        open={Boolean(close)}
        onOpenChange={(v) => {
          if (!v) setClose(null);
        }}
        title={t('sales.closeDraft')}
        onConfirm={() => {
          if (close) {
            remove(close);
            if (selected?.key === close) navigate(parts[0]);
          }
          setClose(null);
        }}
      >
        {t('sales.discardDraft')}
      </ConfirmDialog>
    </div>
  );
}
