import { RecurringDialog } from '../customers/Recurring';
import { MessageDialog } from '../customers/Messages';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Select, useToast } from '../../components/ui';
import { useNavigation } from '../../app/state';
import { SaleField, useSales } from './common';
import { ComplianceActions } from '../compliance/ComplianceActions';
import { THEMES } from '../../../shared/print-settings';
import { unwrap } from '../../../shared/types';
import { CollectUpiButton } from '../payments/CollectButton';
export function InvoicePreview({ id, onNew }: { id: number; onNew: () => void }) {
  const { t } = useTranslation(),
    { firmId, settings, saveSetting, error } = useSales(),
    { navigate, route } = useNavigation(),
    toast = useToast();
  const [recurring, setRecurring] = useState(false),
    [message, setMessage] = useState<{ phone: string; message: string } | null>(null);
  const doc = useQuery({
    queryKey: ['saved-document', firmId, id],
    queryFn: async () => unwrap(await window.api.sales.get(firmId, id)),
  });
  const [theme, setTheme] = useState(String(settings.printTheme ?? 'classic')),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['invoice-preview', firmId, id, theme, settings],
    queryFn: async () => unwrap(await window.api.sales.preview(firmId, id, theme)),
  });
  async function output(action: 'pdf' | 'print' | 'thermal' | 'whatsapp' | 'email') {
    setBusy(true);
    try {
      const path = unwrap(await window.api.sales.output(firmId, id, action, theme));
      if (path)
        toast(
          t(
            action === 'whatsapp'
              ? 'sales.shared'
              : action === 'email'
                ? 'sales.emailShared'
                : 'sales.pdfSaved',
          ),
        );
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="invoice-preview-layout">
      <aside className="card stack" data-tour="sales-work">
        <h3>{t('sales.themes')}</h3>
        {THEMES.map((value) => (
          <Button
            className="theme-choice"
            aria-pressed={theme === value}
            variant={theme === value ? 'primary' : 'ghost'}
            key={value}
            onClick={() => setTheme(value)}
          >
            <span className={`theme-swatch swatch-${value}`} aria-hidden="true" />
            {t(`sales.theme.${value}`)}
          </Button>
        ))}
        <SaleField name="accent">
          <input
            className="input"
            id="sale-accent"
            type="color"
            value={String(settings.printAccent)}
            onChange={(e) => void saveSetting('printAccent', e.target.value, true).catch(() => {})}
          />
        </SaleField>
        <Button
          variant="secondary"
          onClick={() => void saveSetting('printTheme', theme).catch(() => {})}
        >
          {t('sales.defaultTheme')}
        </Button>
      </aside>
      <div>
        {query.isError ? (
          <EmptyState
            title={t('error')}
            description={t('storage')}
            action={t('retry')}
            onAction={() => void query.refetch()}
          />
        ) : query.data ? (
          <iframe
            className="invoice-page"
            title={t('sales.preview')}
            sandbox=""
            srcDoc={query.data}
          />
        ) : (
          <p>{t('loading')}</p>
        )}
      </div>
      <aside className="card stack" data-tour="sales-actions">
        <h3>{t('sales.actions')}</h3>
        {(['pdf', 'print', 'thermal', 'whatsapp', 'email'] as const).map((a) => (
          <Button
            key={a}
            disabled={busy}
            variant={a === 'print' ? 'primary' : 'secondary'}
            onClick={() => void output(a)}
          >
            {t(`sales.output.${a}`)}
          </Button>
        ))}
        <SaleField name="thermalWidth">
          <Select
            label={t('sales.thermalWidth')}
            value={theme === 'thermal58' ? 'thermal58' : 'thermal80'}
            onChange={setTheme}
            options={['thermal58', 'thermal80'].map((value) => ({
              value,
              label: t(`sales.theme.${value}`),
            }))}
          />
        </SaleField>
        <ComplianceActions id={id} />
        <p className="muted">{t('sales.shareHelp')}</p>
        <Button
          variant="secondary"
          onClick={() =>
            void window.api.customers.message(firmId, id).then(unwrap).then(setMessage).catch(error)
          }
        >
          {t('orders.message')}
        </Button>
        {doc.data?.type === 'sale' && doc.data.status === 'posted' && (
          <Button variant="secondary" onClick={() => setRecurring(true)}>
            {t('orders.makeRecurring')}
          </Button>
        )}
        {doc.data?.type === 'sale' && <CollectUpiButton invoiceId={id} />}
        {recurring && <RecurringDialog sourceId={id} onClose={() => setRecurring(false)} />}
        {message && <MessageDialog value={message} onClose={() => setMessage(null)} />}
        <Button onClick={onNew}>{t('sales.new')}</Button>
        <Button variant="ghost" onClick={() => navigate(route.split('/')[0])}>
          {t('sales.backList')}
        </Button>
      </aside>
    </div>
  );
}
