import { LoyaltyRedeem } from '../customers/LoyaltyRedeem';
import { ExpenseFields } from './ExpenseFields';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, ConfirmDialog, useToast } from '../../components/ui';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import { useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import {
  documentSchema,
  documentCreditWarning,
  stockShortages,
  totals,
  type SavedDocument,
} from '../../../shared/sales';
import { sumPaise } from '../../../shared/money';
import { invoiceHtml } from '../../../shared/invoice-html';
import { useDrafts, salesRoute, type Draft } from './drafts';
import { DocumentHeader } from './DocumentHeader';
import { ItemGrid } from './ItemGrid';
import { DocumentFooter } from './DocumentFooter';
import { useSales } from './common';
export function TransactionEditor({ draft, onNew }: { draft: Draft; onNew: () => void }) {
  const { t, i18n } = useTranslation(),
    { firm, firmId, settings, parties, items, error, invalidate } = useSales(),
    toast = useToast();
  const { navigate } = useNavigation(),
    { put, remove } = useDrafts();
  const [busy, setBusy] = useState(false),
    [duplicate, setDuplicate] = useState(false),
    [live, setLive] = useState(false),
    [validation, setValidation] = useState('');
  const [creditConfirm, setCreditConfirm] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useSaveShortcut(form);
  const doc = draft.doc;
  const update = (patch: Partial<typeof doc> | ((current: typeof doc) => Partial<typeof doc>)) => {
    const current = useDrafts.getState().tabs.find((d) => d.key === draft.key) ?? draft;
    put({
      ...current,
      doc: { ...current.doc, ...(typeof patch === 'function' ? patch(current.doc) : patch) },
      updatedAt: new Date().toISOString(),
    });
  };
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      void window.api.sales
        .available(firmId, doc.type, doc.prefix, doc.number, draft.id)
        .then(unwrap)
        .then((v) => {
          if (current) setDuplicate(!v);
        })
        .catch(error);
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [firmId, doc.type, doc.prefix, doc.number, draft.id, error]);
  let calculated: ReturnType<typeof totals> | undefined;
  try {
    calculated = totals(doc, firm!.stateCode);
  } catch {
    /* Explain invalid values below, preserving the draft. */
  }
  const party = parties.find((p) => p.id === doc.partyId),
    received = sumPaise(doc.payments.map((p) => p.amount));
  let credit = false,
    stockWarning = false;
  try {
    credit =
      Boolean(calculated) && documentCreditWarning(doc, firm!.stateCode, party, draft.original);
    stockWarning =
      Boolean(settings.stock) &&
      doc.type === 'sale' &&
      stockShortages(doc, items, draft.original).length > 0;
  } catch {
    /* Validation below explains incomplete numeric values. */
  }
  async function save(mode = 'save', approved = false) {
    if (busy) return;
    if (!form.current?.reportValidity() || form.current.querySelector('[aria-invalid="true"]'))
      return;
    const parsed = documentSchema.safeParse(doc);
    if (!parsed.success || !calculated) {
      setValidation(t('sales.invalid'));
      return;
    }
    if (duplicate) {
      setValidation(t('sales.error.duplicate'));
      return;
    }
    if (credit && !approved) {
      setCreditConfirm(mode);
      return;
    }
    setBusy(true);
    setValidation('');
    try {
      const saved = unwrap(await window.api.sales.save(firmId, draft.id, parsed.data));
      remove(draft.key);
      await invalidate();
      toast(t('saved'));
      if (mode === 'new') {
        onNew();
        return;
      }
      if (mode === 'print' || mode === 'share' || settings.invoicePreview)
        navigate(`${salesRoute(doc.type)}/preview/${saved.id}`);
      else navigate(salesRoute(doc.type));
      if (mode === 'print') unwrap(await window.api.sales.output(firmId, saved.id, 'print'));
      if (mode === 'share') unwrap(await window.api.sales.output(firmId, saved.id, 'whatsapp'));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  const labels = Object.fromEntries(
    Object.keys(i18n.getResourceBundle(i18n.language, 'translation') as Record<string, string>)
      .filter((k) => k.startsWith('print.'))
      .map((k) => [k.slice(6), t(k)]),
  );
  const previewDoc: SavedDocument = {
    ...doc,
    id: draft.id ?? 0,
    firmId,
    total: calculated?.total ?? 0,
    received,
    balance: (calculated?.total ?? 0) - received,
    status: 'draft',
    paymentStatus: 'unpaid',
    deletedAt: null,
    partyGstin: party?.gstin ?? '',
  };
  return (
    <form
      ref={form}
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (!(e.target as HTMLElement).closest('.invoice-grid')) advanceField(e);
      }}
    >
      <div className="sales-editor-title">
        <h2>{t(`sales.type.${doc.type}`)}</h2>
        <span className="muted">{t('sales.autosaved')}</span>
        <Checkbox label={t('sales.livePreview')} checked={live} onCheckedChange={setLive} />
      </div>
      {validation && (
        <p className="field-error" role="alert">
          {validation}
        </p>
      )}
      {credit && (
        <p className="sales-warning" role="alert">
          {t('sales.creditWarning')}
        </p>
      )}
      {stockWarning && (
        <p className="sales-warning" role="alert">
          {t(settings.negativeStock ? 'sales.stockBlocked' : 'sales.stockWarning')}
        </p>
      )}
      <DocumentHeader doc={doc} update={update} duplicate={duplicate} />
      {['expense', 'other_income'].includes(doc.type) && (
        <ExpenseFields doc={doc} update={update} />
      )}
      {doc.expenseMode !== 'simple' && (
        <ItemGrid doc={doc} update={update} results={calculated?.lines ?? []} />
      )}
      {calculated && (
        <LoyaltyRedeem
          doc={doc}
          id={draft.id}
          maximum={totals({ ...doc, loyaltyDiscount: 0 }, firm!.stateCode).taxable}
          update={update}
        />
      )}
      {calculated && <DocumentFooter doc={doc} update={update} calculated={calculated} />}
      {live && calculated && (
        <iframe
          className="invoice-live"
          title={t('sales.livePreview')}
          sandbox=""
          srcDoc={invoiceHtml({ firm: firm!, doc: previewDoc, settings, labels })}
        />
      )}
      <div className="form-actions sales-save" data-tour="sales-actions">
        <Button variant="secondary" onClick={() => navigate(salesRoute(doc.type))}>
          {t('sales.hold')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void save('new')}>
          {t('masters.saveNew')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void save('print')}>
          {t('sales.savePrint')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void save('share')}>
          {t('sales.share')}
        </Button>
        <Button type="submit" disabled={busy}>
          {t('save')} <kbd>{t('sales.ctrlS')}</kbd>
        </Button>
      </div>
      <ConfirmDialog
        open={creditConfirm !== null}
        onOpenChange={(v) => {
          if (!v) setCreditConfirm(null);
        }}
        title={t('sales.creditWarning')}
        onConfirm={() => {
          const mode = creditConfirm!;
          setCreditConfirm(null);
          void save(mode, true);
        }}
      >
        {t('sales.creditConfirm')}
      </ConfirmDialog>
    </form>
  );
}
