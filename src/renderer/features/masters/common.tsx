import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { useApp } from '../../app/state';
import { unwrap } from '../../../shared/types';
import type { Lookups } from '../../../shared/masters';
import { Field, Input, MoneyInput, Select } from '../../components/ui';
export const emptyLookups: Lookups = {
  groups: [],
  categories: [],
  units: [],
  conversions: [],
  taxes: [],
};
export function useMasters() {
  const app = useApp(),
    client = useQueryClient();
  const firmId = app.firm!.id;
  const query = useQuery({
    queryKey: ['lookups', firmId],
    queryFn: async () => unwrap(await window.api.masters.lookups(firmId)),
  });
  return {
    ...app,
    firmId,
    lookups: query.data ?? emptyLookups,
    invalidate: () => client.invalidateQueries(),
  };
}
export function MasterField({
  name,
  children,
  error,
}: {
  name: string;
  children: ReactNode;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <Field id={`master-${name}`} label={t(`masters.${name}`)} help={`master-${name}`} error={error}>
      {children}
    </Field>
  );
}
export function TextField({
  name,
  value,
  onChange,
  type = 'text',
  required = false,
  error,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <MasterField name={name} error={error}>
      <Input
        id={`master-${name}`}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </MasterField>
  );
}
export function AmountField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <MasterField name={name}>
      <MoneyInput id={`master-${name}`} value={value} onValueChange={onChange} />
    </MasterField>
  );
}
export function QtyField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <MasterField name={name}>
      <Input
        id={`master-${name}`}
        type="number"
        min="0"
        step="0.001"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </MasterField>
  );
}
export function Choice({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const { t } = useTranslation();
  return (
    <MasterField name={name}>
      <Select label={t(`masters.${name}`)} value={value} onChange={onChange} options={options} />
    </MasterField>
  );
}
export function CustomFields({
  kind,
  values,
  onChange,
}: {
  kind: 'party' | 'item';
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const { settings } = useApp();
  return (
    <>
      {[1, 2, 3, 4].map((n) =>
        settings[`${kind}Custom${n}Name`] ? (
          <Field
            key={n}
            id={`custom-${n}`}
            label={String(settings[`${kind}Custom${n}Name`])}
            help="master-customFields"
          >
            <Input
              id={`custom-${n}`}
              type={settings[`${kind}Custom${n}Type`] === 'date' ? 'date' : 'text'}
              value={values[n] ?? ''}
              onChange={(e) => onChange({ ...values, [n]: e.target.value })}
            />
          </Field>
        ) : null,
      )}
    </>
  );
}
export function FormErrors({ fields }: { fields: string[] }) {
  const { t } = useTranslation();
  if (!fields.length) return null;
  return (
    <div className="field-error" role="alert">
      {fields
        .map((f) =>
          t(`masters.error.${f}`, {
            defaultValue: t('masters.checkField', { field: t(`masters.${f}`) }),
          }),
        )
        .join(' · ')}
    </div>
  );
}
