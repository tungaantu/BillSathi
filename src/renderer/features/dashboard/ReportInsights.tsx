import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { unwrap } from '../../../shared/types';
import { formatINR } from '../../../shared/money';
import { formatDate } from '../../../shared/dates';
import { useApp, useNavigation } from '../../app/state';
import { Button, EmptyState, Skeleton, StatCard } from '../../components/ui';
import { shortcutIds } from '../reports/common';
import '../reports/reports.css';

export function ReportInsights() {
  const { t } = useTranslation(),
    { firm, settings } = useApp(),
    { navigate } = useNavigation();
  const [range, setRange] = useState<'week' | 'month' | 'year'>('month');
  const query = useQuery({
    queryKey: ['insights', firm!.id, range],
    queryFn: async () => unwrap(await window.api.reports.insights(firm!.id, range)),
  });
  if (query.isPending) return <Skeleton />;
  if (query.isError)
    return (
      <EmptyState
        title={t('error')}
        description={t('localOnly')}
        action={t('retry')}
        onAction={() => void query.refetch()}
      />
    );
  const data = query.data,
    decimals = Number(settings.decimals ?? 2);
  const shortcuts = shortcutIds(settings);
  const dates = (value: unknown) =>
    String(value).length === 7 ? String(value) : formatDate(String(value), settings);
  return (
    <div className="stack">
      <div className="report-alerts" aria-label={t('reports.alerts')}>
        {data.alerts.overdueCount > 0 && (
          <Button variant="secondary" onClick={() => navigate('reports/sale?due=overdue')}>
            {t('reports.overdue', {
              count: data.alerts.overdueCount,
              amount: formatINR(data.alerts.overdueTotal, decimals),
            })}
          </Button>
        )}
        {data.alerts.lowStock > 0 && (
          <Button variant="secondary" onClick={() => navigate('reports/lowStock')}>
            {t('reports.lowAlert', { count: data.alerts.lowStock })}
          </Button>
        )}
        {data.alerts.chequesDue > 0 && (
          <Button variant="secondary" onClick={() => navigate('cheques')}>
            {t('reports.chequesAlert', { count: data.alerts.chequesDue })}
          </Button>
        )}
      </div>
      <div className="dashboard-grid">
        <section className="card chart-card">
          <div className="section-heading">
            <h3>{t('reports.chart')}</h3>
            <div className="button-row">
              {(['week', 'month', 'year'] as const).map((v) => (
                <Button
                  key={v}
                  variant={v === range ? 'primary' : 'ghost'}
                  aria-pressed={v === range}
                  onClick={() => setRange(v)}
                >
                  {t(`reports.range.${v}`)}
                </Button>
              ))}
            </div>
          </div>
          {data.series.some((p) => p.sales || p.purchase) ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tickFormatter={dates}
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  />
                  <YAxis
                    tickFormatter={(v) => formatINR(Number(v), 0)}
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  />
                  <Tooltip
                    formatter={(v) => formatINR(Number(v), decimals)}
                    labelFormatter={dates}
                  />
                  <Area
                    dataKey="sales"
                    name={t('reports.type.sale')}
                    stroke="var(--primary)"
                    fill="var(--primary-soft)"
                  />
                  <Area
                    dataKey="purchase"
                    name={t('reports.type.purchase')}
                    stroke="var(--accent)"
                    fill="var(--accent-soft)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title={t('chartEmpty')}
              description={t('chartBody')}
              action={t('newSale')}
              onAction={() => navigate('invoices/new')}
            />
          )}
        </section>
        <div className="stack">
          <button
            className="report-card-open"
            onClick={() => navigate(`reports/profitLoss?from=${data.profitFrom}`)}
          >
            <StatCard
              label={t('reports.profitMonth')}
              value={data.profitMonth}
              icon={<TrendingUp size={20} />}
              tone={data.profitMonth >= 0 ? 'success' : 'danger'}
              decimals={decimals}
            />
          </button>
          <section className="card" style={{ padding: 20 }}>
            <h3>{t('reports.mostUsed')}</h3>
            <div className="report-shortcuts">
              {(shortcuts.length ? shortcuts : ['profitLoss', 'sale', 'stockSummary']).map((id) => (
                <Button key={id} variant="ghost" onClick={() => navigate(`reports/${id}`)}>
                  {t(`reports.name.${id}`)}
                </Button>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div className="report-top-list">
        {[
          {
            title: 'topCustomers',
            rows: data.topCustomers.map((r) => ({ id: r.partyId, name: r.name, total: r.total })),
            path: 'parties',
          },
          {
            title: 'topItems',
            rows: data.topItems.map((r) => ({ id: r.itemId, name: r.name, total: r.total })),
            path: 'items',
          },
        ].map((group) => (
          <section className="card" key={group.title}>
            <h3>{t(`reports.${group.title}`)}</h3>
            {group.rows.length ? (
              group.rows.map((row) => (
                <button key={row.id} onClick={() => navigate(`${group.path}/${row.id}`)}>
                  <span>{row.name}</span>
                  <span className="money">{formatINR(row.total, decimals)}</span>
                </button>
              ))
            ) : (
              <EmptyState
                title={t('chartEmpty')}
                description={t('chartBody')}
                action={t('newSale')}
                onAction={() => navigate('invoices/new')}
              />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
