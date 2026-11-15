import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input, Select, Switch } from '../../components/ui';
import { SaleField } from '../sales/common';
import { useApp } from '../../app/state';
import { PRINT_SWITCHES, THEMES } from '../../../shared/print-settings';
import type { SettingValue } from '../../../shared/types';
export function SettingText({ name, multiline = false }: { name: string; multiline?: boolean }) {
  const { settings, saveSetting } = useApp();
  const [value, set] = useState(String(settings[name] ?? ''));
  return (
    <SaleField name={name}>
      {multiline ? (
        <textarea
          className="input"
          id={`sale-${name}`}
          value={value}
          onChange={(e) => set(e.target.value)}
          onBlur={() => void saveSetting(name, value).catch(() => {})}
        />
      ) : (
        <Input
          id={`sale-${name}`}
          value={value}
          onChange={(e) => set(e.target.value)}
          onBlur={() => void saveSetting(name, value).catch(() => {})}
        />
      )}
    </SaleField>
  );
}
export function PrintSettings() {
  const { t } = useTranslation(),
    { settings, saveSetting } = useApp();
  const change = (key: string, value: SettingValue) => void saveSetting(key, value).catch(() => {});
  const choices: Record<string, (string | number)[]> = {
    printTheme: [...THEMES],
    printPaper: ['A4', 'A5'],
    printOrientation: ['portrait', 'landscape'],
    printFont: [8, 9, 10, 11, 12, 14, 16, 18],
    printCopies: [1, 2, 3],
    printMinRows: [0, 5, 8, 10, 15, 20, 30, 40],
    printTopSpace: [0, 5, 10, 15, 20, 30, 40, 50],
  };
  return (
    <section className="card sales-header stack" data-tour="sales-work">
      <h2>{t('settings.print')}</h2>
      <div className="form-grid" data-tour="sales-actions">
        {Object.entries(choices).map(([name, values]) => (
          <SaleField name={name} key={name}>
            <Select
              label={t(`sales.${name}`)}
              value={String(settings[name])}
              onChange={(v) => change(name, typeof values[0] === 'number' ? Number(v) : v)}
              options={values.map((v) => ({
                value: String(v),
                label:
                  typeof v === 'number'
                    ? String(v)
                    : name === 'printTheme'
                      ? t(`sales.theme.${v}`)
                      : t(`sales.${v}`),
              }))}
            />
          </SaleField>
        ))}
        <SaleField name="printAccent">
          <Input
            id="sale-printAccent"
            type="color"
            value={String(settings.printAccent)}
            onChange={(e) => change('printAccent', e.target.value)}
          />
        </SaleField>
        <SettingText name="printTitle" />
      </div>
      <div className="form-grid">
        {PRINT_SWITCHES.map((name) => (
          <SaleField name={name} key={name}>
            <Switch
              label={t(`sales.${name}`)}
              checked={Boolean(settings[name])}
              onCheckedChange={(v) => change(name, v)}
            />
          </SaleField>
        ))}
      </div>
    </section>
  );
}
export function TransactionSettings() {
  const { t } = useTranslation(),
    { settings, saveSetting } = useApp();
  return (
    <section className="card sales-header stack">
      <div className="form-grid">
        {['cashDefault', 'freeQty'].map((name) => (
          <SaleField name={name} key={name}>
            <Switch
              label={t(`sales.${name}`)}
              checked={Boolean(settings[name])}
              onCheckedChange={(v) => void saveSetting(name, v).catch(() => {})}
            />
          </SaleField>
        ))}
        <SaleField name="roundMode">
          <Select
            label={t('sales.roundMode')}
            value={String(settings.roundMode)}
            onChange={(v) => void saveSetting('roundMode', v).catch(() => {})}
            options={['off', 'nearest', 'up', 'down'].map((value) => ({
              value,
              label: t(`sales.${value}`),
            }))}
          />
        </SaleField>
        <SaleField name="roundStep">
          <Select
            label={t('sales.roundStep')}
            value={String(settings.roundStep)}
            onChange={(v) => void saveSetting('roundStep', Number(v)).catch(() => {})}
            options={[100, 50, 10].map((v) => ({ value: String(v), label: t(`sales.step${v}`) }))}
          />
        </SaleField>
        {['sale', 'sale_return', 'estimate', 'sale_order', 'payment_in'].map((type) => (
          <SettingText key={type} name={`prefix.${type}`} />
        ))}
      </div>
      <SettingText name="defaultTerms" multiline />
      <SettingText name="shareMessage" multiline />
    </section>
  );
}
