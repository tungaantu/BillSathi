import { useTranslation } from 'react-i18next';
import { useApp, useNavigation } from '../../app/state';
import { HelpTip, Select, Switch, Tabs, InfoBanner } from '../../components/ui';
import { CustomerSettings } from '../customers/CustomerSettings';
import { Profile } from './Profile';
import { MasterSettings } from './MasterSettings';
import { PrintSettings, TransactionSettings } from './PrintSettings';
import { DATE_FORMATS } from '../../../shared/dates';
import { BackupSettings, PasscodeSettings } from '../safety';
import { PaymentSettings } from '../payments/PaymentSettings';
const sections: Record<string, string[]> = {
  general: [
    'negativeStock',
    'auditTrail',
    'challanStock',
    'challanReturns',
    'challanAmount',
    'godowns',
    'posAutoPrint',
  ],
  transaction: ['invoicePreview', 'dueDates', 'roundOff'],
  print: ['printBank', 'printSignature'],
  tax: ['gst', 'hsn', 'reverseCharge'],
  messages: ['messages', 'reminders'],
  party: ['partyGroups', 'shippingAddress', 'partyStatus', 'loyalty'],
  item: [
    'partyRates',
    'rememberPartyPrice',
    'stock',
    'barcode',
    'itemTax',
    'itemDiscount',
    'wholesale',
    'mrp',
    'batches',
    'serials',
    'updatePurchasePrice',
    'updateSalePrice',
  ],
  backup: ['autoBackup', 'backupReminder'],
};
export function Settings() {
  const { t } = useTranslation();
  const { route, navigate } = useNavigation();
  const { settings, saveSetting, firm } = useApp();
  const section = route === 'profile' ? 'profile' : (route.split('/')[1] ?? 'general');
  const tabs = [...Object.keys(sections), 'payments', 'profile'];
  const change = (key: string, value: string | number | boolean) =>
    void saveSetting(key, value).catch(() => {});
  const toggle = (key: string) => (
    <div className="setting-row" key={key}>
      <div className="field-label">
        <span>{t(`setting.${key}`)}</span>
        <HelpTip id={`setting-${key}`} />
      </div>
      <Switch
        label={t(`setting.${key}`)}
        checked={Boolean(settings[key])}
        onCheckedChange={(value) => change(key, value)}
      />
    </div>
  );
  const select = (key: string, options: { value: string; label: string }[], numeric = false) => (
    <div className="setting-row" key={key}>
      <div className="field-label">
        <span>{t(`setting.${key}`)}</span>
        <HelpTip id={`setting-${key}`} />
      </div>
      <div className="setting-control">
        <Select
          label={t(`setting.${key}`)}
          value={String(settings[key])}
          options={options}
          onChange={(value) => change(key, numeric ? Number(value) : value)}
        />
      </div>
    </div>
  );
  return (
    <div className="stack">
      <div className="page-heading" data-tour="sales-new">
        <div>
          <span className="eyebrow">{t('nav.settings')}</span>
          <h1>{t('nav.settings')}</h1>
          <p className="muted">{t('settingsBody')}</p>
        </div>
      </div>
      <Tabs
        value={section}
        onValueChange={(value) => navigate(`settings/${value}`)}
        tabs={tabs.map((value) => ({ value, label: t(`settings.${value}`) }))}
      />
      {section === 'print' ? (
        <PrintSettings />
      ) : section === 'payments' ? (
        <PaymentSettings key={firm!.id} />
      ) : section === 'profile' ? (
        <Profile key={firm!.id} />
      ) : section === 'backup' ? (
        <BackupSettings />
      ) : (
        <>
          {!['general', 'party', 'item', 'transaction', 'messages'].includes(section) && (
            <InfoBanner id={`settings-${section}`}>{t('futureSettings')}</InfoBanner>
          )}
          <section className="card settings-card">
            <h3>{t('settings.' + (section === 'general' ? 'preferences' : section))}</h3>
            {section === 'general' && (
              <>
                {select(
                  'dateFormat',
                  DATE_FORMATS.map((value) => ({ value, label: value })),
                )}
                {select(
                  'decimals',
                  [0, 1, 2].map((n) => ({ value: String(n), label: String(n) })),
                  true,
                )}
                {select(
                  'zoom',
                  [80, 90, 100, 110, 120, 130].map((n) => ({ value: String(n), label: `${n}%` })),
                  true,
                )}
                {select(
                  'theme',
                  ['light', 'dark'].map((value) => ({ value, label: t(`settings.${value}`) })),
                )}
                {select(
                  'language',
                  ['en', 'hi'].map((value) => ({ value, label: t(`settings.${value}`) })),
                )}
              </>
            )}
            {(sections[section] ?? []).map(toggle)}
            {section === 'item' &&
              select(
                'qtyDecimals',
                [0, 1, 2, 3].map((n) => ({ value: String(n), label: String(n) })),
                true,
              )}
          </section>
          <CustomerSettings section={section} />
          {section === 'transaction' && <TransactionSettings />}
          {(section === 'party' || section === 'item') && (
            <MasterSettings key={`${firm!.id}-${section}`} kind={section} />
          )}
          {section === 'general' && <PasscodeSettings />}
          {section === 'general' && (
            <section className="card settings-card">
              <h3>{t('settings.modules')}</h3>
              {['estimate', 'proforma', 'orders', 'challan', 'otherIncome'].map(toggle)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
