import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { MoneyText } from '../../components/ui';
import { useSales } from './common';
import { formatINR, sumPaise } from '../../../shared/money';
import { unwrap } from '../../../shared/types';
import { today } from '../../../shared/masters';
import type { SaleSummary } from '../../../shared/sales';
export function ExpenseSummary({
  rows,
  type,
}: {
  rows: SaleSummary[];
  type: 'expense' | 'other_income';
}) {
  const { t } = useTranslation(),
    { firmId } = useSales();
  const categories = useQuery({
    queryKey: ['expense-categories', firmId, type],
    queryFn: async () => unwrap(await window.api.sales.categories(firmId, type)),
  });
  const groups = (categories.data ?? []).map((c) => ({
    name: t(`category.${c.name}`, { defaultValue: c.name }),
    total: sumPaise(
      rows
        .filter((r) => r.categoryId === c.id && r.status === 'posted' && !r.deletedAt)
        .map((r) => r.total),
    ),
    month: sumPaise(
      rows
        .filter(
          (r) =>
            r.categoryId === c.id &&
            r.status === 'posted' &&
            !r.deletedAt &&
            r.date.slice(0, 7) === today().slice(0, 7),
        )
        .map((r) => r.total),
    ),
  }));
  return (
    <section className="card sales-header expense-summary">
      <div>
        <h3>{t('sales.categoryTotals')}</h3>
        {groups.map((g) => (
          <p key={g.name}>
            {g.name}: <MoneyText value={g.total} />
          </p>
        ))}
      </div>
      <div>
        <h3>{t('sales.monthSpend')}</h3>
        <div className="expense-chart">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                isAnimationActive={false}
                data={groups.filter((g) => g.month > 0)}
                nameKey="name"
                dataKey="month"
                innerRadius={48}
                outerRadius={76}
              >
                {groups.map((g, i) => (
                  <Cell
                    key={g.name}
                    fill={
                      ['var(--primary)', 'var(--accent)', 'var(--success)', 'var(--muted)'][i % 4]
                    }
                  />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatINR(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
