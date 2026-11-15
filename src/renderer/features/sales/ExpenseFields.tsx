import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Input, Select, Checkbox } from '../../components/ui';
import { SaleField, SaleMoney, useSales } from './common';
import { blankLine, simpleExpenseAmount, type SaleDocument } from '../../../shared/sales';
import { unwrap } from '../../../shared/types';
export function ExpenseFields({
  doc,
  update,
}: {
  doc: SaleDocument;
  update: (patch: Partial<SaleDocument>) => void;
}) {
  const { t } = useTranslation(),
    { firmId, accounts, error, invalidate } = useSales();
  const [name, setName] = useState('');
  const kind = doc.type === 'other_income' ? 'other_income' : 'expense';
  const categories = useQuery({
    queryKey: ['expense-categories', firmId, kind],
    queryFn: async () => unwrap(await window.api.sales.categories(firmId, kind)),
  });
  const simple = doc.expenseMode === 'simple';
  return (
    <section className="card sales-header form-grid">
      <SaleField name="category">
        <Select
          label={t('sales.category')}
          value={String(doc.categoryId ?? '')}
          options={(categories.data ?? []).map((c) => ({
            value: String(c.id),
            label: t(`category.${c.name}`, { defaultValue: c.name }),
          }))}
          onChange={(v) => update({ categoryId: Number(v) })}
        />
      </SaleField>
      <SaleField name="newCategory">
        <Input id="sale-newCategory" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          variant="secondary"
          disabled={!name.trim()}
          onClick={() =>
            void window.api.sales
              .category(firmId, kind, name)
              .then(unwrap)
              .then(async (id) => {
                update({ categoryId: id });
                setName('');
                await invalidate();
              })
              .catch(error)
          }
        >
          {t('add')}
        </Button>
      </SaleField>
      <SaleField name="expenseMode">
        <Checkbox
          label={t('sales.simpleAmount')}
          checked={simple}
          onCheckedChange={(v) =>
            update({
              expenseMode: v ? 'simple' : 'itemised',
              lines: v ? [{ ...blankLine(), name: t('sales.simpleAmount') }] : [],
            })
          }
        />
      </SaleField>
      {simple && (
        <SaleMoney
          name="expenseAmount"
          value={doc.lines[0].price}
          onChange={(price) => {
            if (accounts[0]) update(simpleExpenseAmount(doc, price, accounts[0].id));
          }}
        />
      )}
    </section>
  );
}
