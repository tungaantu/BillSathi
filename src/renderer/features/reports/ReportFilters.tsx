import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DATE_PRESETS, resolvePreset, type DatePreset } from '../../../shared/report-dates';
import { today } from '../../../shared/masters';
import { unwrap } from '../../../shared/types';
import type { FilterKey, ReportDef, ReportFilters as Filters } from '../../../shared/reports';
import { useApp } from '../../app/state';
import { Combobox, Field, Input } from '../../components/ui';

const DOCS = [
  'sale',
  'purchase',
  'sale_return',
  'purchase_return',
  'payment_in',
  'payment_out',
  'expense',
  'other_income',
  'estimate',
  'sale_order',
  'purchase_order',
];
export function ReportFilters({
  def,
  filters,
  onChange,
  preset,
  setPreset,
}: {
  def: ReportDef;
  filters: Filters;
  onChange: (value: Filters) => void;
  preset: DatePreset;
  setPreset: (value: DatePreset) => void;
}) {
  const { t } = useTranslation(),
    { firm, firms, selectFirm, settings } = useApp();
  const options = useQuery({
    queryKey: ['reportLookups', firm!.id],
    queryFn: async () => {
      const [masters, parties, items, accounts, expenses, loans, godowns] = await Promise.all([
        window.api.masters.lookups(firm!.id),
        window.api.masters.parties(firm!.id),
        window.api.masters.items(firm!.id),
        window.api.finance.accounts(firm!.id),
        window.api.sales.categories(firm!.id, 'expense'),
        window.api.finance.loans(firm!.id),
        window.api.inventory.godowns(firm!.id),
      ]);
      return {
        masters: unwrap(masters),
        parties: unwrap(parties),
        items: unwrap(items),
        accounts: unwrap(accounts),
        expenses: unwrap(expenses),
        loans: unwrap(loans),
        godowns: godowns.ok ? godowns.data : [],
      };
    },
  });
  const named = (rows?: { id: number; name: string }[]) =>
    rows?.map((r) => ({
      value: String(r.id),
      label: t(`category.${r.name}`, { defaultValue: r.name }),
    })) ?? [];
  const data = options.data;
  const keys: Partial<Record<FilterKey, keyof Filters>> = {
    party: 'partyId',
    item: 'itemId',
    itemCategory: 'categoryId',
    partyGroup: 'groupId',
    account: 'accountId',
    paymentType: 'paymentType',
    side: 'side',
    docType: 'docType',
    expenseCategory: 'expenseCategoryId',
    loan: 'loanId',
    godown: 'godownId',
  };
  const lists: Partial<Record<FilterKey, { value: string; label: string }[]>> = {
    party: named(data?.parties),
    item: named(data?.items),
    itemCategory: named(data?.masters.categories),
    partyGroup: named(data?.masters.groups),
    account: named(data?.accounts.filter((a) => ['bank', 'upi', 'card'].includes(a.type))),
    expenseCategory: named(data?.expenses),
    loan: named(data?.loans),
    godown: named(data?.godowns),
    paymentType: ['cash', 'bank', 'upi', 'card', 'cheque'].map((v) => ({
      value: v,
      label: t(`sales.account.${v}`),
    })),
    side: ['sale', 'purchase'].map((v) => ({ value: v, label: t(`reports.type.${v}`) })),
    docType: DOCS.map((v) => ({ value: v, label: t(`reports.type.${v}`) })),
  };
  return (
    <section className="card report-filters" data-tour="report-filters">
      <Field id="report-firm" label={t('reports.firm')} help="reportFilter.firm">
        <Combobox
          label={t('reports.firm')}
          value={String(firm!.id)}
          options={named(firms)}
          onChange={(v) => selectFirm(Number(v))}
        />
      </Field>
      {def.filters.includes('period') && (
        <>
          <Field id="report-period" label={t('reports.period')} help="reportFilter.period">
            <Combobox
              label={t('reports.period')}
              value={preset}
              options={DATE_PRESETS.map((v) => ({ value: v, label: t(`reports.preset.${v}`) }))}
              onChange={(v) => {
                setPreset(v as DatePreset);
                if (v !== 'custom')
                  onChange({ ...filters, ...resolvePreset(v as DatePreset, today()) });
              }}
            />
          </Field>
          {(['from', 'to'] as const).map((key) => (
            <Field id={`report-${key}`} key={key} label={t(`reports.${key}`)}>
              <Input
                id={`report-${key}`}
                type="date"
                value={filters[key]}
                onChange={(e) => {
                  setPreset('custom');
                  onChange({ ...filters, [key]: e.target.value });
                }}
              />
            </Field>
          ))}
        </>
      )}
      {def.filters.includes('asOn') && (
        <Field id="report-asOn" label={t('reports.asOn')} help="reportFilter.asOn">
          <Input
            id="report-asOn"
            type="date"
            value={filters.asOn ?? today()}
            onChange={(e) => onChange({ ...filters, asOn: e.target.value })}
          />
        </Field>
      )}
      {def.filters
        .filter((key) => keys[key] && (key !== 'godown' || settings.godowns))
        .map((key) => {
          const field = keys[key]!,
            label = t(`reports.filter.${key}`);
          return (
            <Field key={key} id={`report-${key}`} label={label} help={`reportFilter.${key}`}>
              <Combobox
                label={label}
                value={String(filters[field] ?? '')}
                options={[
                  ...(key === 'side' ? [] : [{ value: '', label: t('reports.all') }]),
                  ...(lists[key] ?? []),
                ]}
                onChange={(v) =>
                  onChange({
                    ...filters,
                    [field]: field.endsWith('Id') ? Number(v) || null : v || undefined,
                  })
                }
              />
            </Field>
          );
        })}
      {['sale', 'purchase'].includes(def.id) && (
        <Field id="report-due" label={t('reports.filter.due')} help="reportFilter.due">
          <Combobox
            label={t('reports.filter.due')}
            value={filters.due ?? ''}
            options={['', 'due', 'overdue'].map((v) => ({
              value: v,
              label: t(v ? `reports.due.${v}` : 'reports.all'),
            }))}
            onChange={(v) => onChange({ ...filters, due: (v || undefined) as Filters['due'] })}
          />
        </Field>
      )}
      {options.isError && <p role="alert">{t('error')}</p>}
    </section>
  );
}
