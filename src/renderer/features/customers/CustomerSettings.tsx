import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, HelpTip, Input, MoneyInput, Select, useToast } from '../../components/ui';
import { useApp } from '../../app/state';
import { renderMessage } from '../../../shared/customer-features';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
const documents = [
  'sale',
  'purchase',
  'sale_return',
  'purchase_return',
  'payment_in',
  'payment_out',
  'sale_order',
  'purchase_order',
  'estimate',
  'proforma',
  'delivery_challan',
  'challan_return',
  'cancelled',
  'reminder',
  'service',
];
function TemplateEditor({ kind }: { kind: string }) {
  const { t } = useTranslation(),
    { settings, saveSetting, firm, error } = useApp(),
    toast = useToast();
  const [text, setText] = useState(
    String(
      settings[`message.${kind}`] ??
        t(kind === 'service' ? 'orders.defaultService' : 'orders.defaultMessage'),
    ),
  );
  const form = useRef<HTMLFormElement>(null);
  useSaveShortcut(form);
  const preview = renderMessage(text, {
    party: t('sales.party'),
    doc_no: 'INV-001',
    amount: '₹1,000.00',
    balance: '₹500.00',
    due_date: '10/11/2026',
    firm: firm!.name,
    upi_link: firm!.upiId ? `upi://pay?pa=${encodeURIComponent(firm!.upiId)}` : '',
  });
  return (
    <form
      ref={form}
      className="stack"
      data-tour="customer-list"
      onKeyDown={advanceField}
      onSubmit={(e) => {
        e.preventDefault();
        void saveSetting(`message.${kind}`, text, true)
          .then(() => toast(t('saved')))
          .catch(error);
      }}
    >
      <label>
        {t('orders.template')} <HelpTip id="orders-messages" />
        <textarea
          className="input"
          rows={5}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <p className="muted">{t('orders.placeholders')}</p>
      <h3>{t('orders.preview')}</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{preview}</p>
      <Button data-tour="customer-actions" type="submit">
        {t('save')}
      </Button>
    </form>
  );
}
export function CustomerSettings({ section }: { section: string }) {
  const { t } = useTranslation(),
    { settings, saveSetting } = useApp();
  const [kind, setKind] = useState('sale');
  const numeric = (key: string, money = false) => (
    <label key={key} className="field">
      {t(`setting.${key}`)}
      <HelpTip id={`setting-${key}`} />
      {money ? (
        <MoneyInput
          value={Number(settings[key])}
          onValueChange={(v) => void saveSetting(key, v, true).catch(() => {})}
        />
      ) : (
        <Input
          type="number"
          min="0"
          max={key === 'remindDays' ? 365 : 100000000}
          value={Number(settings[key])}
          onChange={(e) => void saveSetting(key, Number(e.target.value), true).catch(() => {})}
        />
      )}
    </label>
  );
  if (section === 'messages')
    return (
      <section className="card stack">
        <h3 data-tour="customer-new">{t('settings.messages')}</h3>
        <Select
          label={t('orders.document')}
          value={kind}
          onChange={setKind}
          options={documents.map((value) => ({
            value,
            label: t(
              ['cancelled', 'reminder', 'service'].includes(value)
                ? `orders.${value}`
                : `sales.type.${value}`,
            ),
          }))}
        />
        <TemplateEditor key={kind} kind={kind} />
        {numeric('remindDays')}
      </section>
    );
  if (section !== 'party') return null;
  return (
    <section className="card stack">
      <h3 data-tour="customer-new">{t('orders.loyalty')}</h3>
      <div className="form-grid" data-tour="customer-list">
        {numeric('loyaltyEarnPoints')}
        {numeric('loyaltyPerPaise', true)}
        {numeric('loyaltyValuePaise', true)}
        <label>
          {t('setting.loyaltyBasis')}
          <HelpTip id="setting-loyaltyBasis" />
          <Select
            label={t('setting.loyaltyBasis')}
            value={String(settings.loyaltyBasis)}
            options={['total', 'paid'].map((value) => ({ value, label: t(`orders.${value}`) }))}
            onChange={(v) => void saveSetting('loyaltyBasis', v, true).catch(() => {})}
          />
        </label>
      </div>
      <Button
        data-tour="customer-actions"
        variant="secondary"
        onClick={() => {
          location.hash = 'parties';
        }}
      >
        {t('nav.parties')}
      </Button>
    </section>
  );
}
