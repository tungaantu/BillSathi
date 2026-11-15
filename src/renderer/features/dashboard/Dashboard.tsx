import { ReportInsights } from './ReportInsights';
import { CustomerAlerts } from '../customers/CustomerAlerts';
import { InventoryAlerts } from '../inventory/InventoryAlerts';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ShoppingBag,
  Package,
  Landmark,
  Check,
  ArrowRight,
  Users,
  Plus,
} from 'lucide-react';
import { unwrap } from '../../../shared/types';
import { useApp, useNavigation } from '../../app/state';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  InfoBanner,
  Skeleton,
  StatCard,
  useToast,
} from '../../components/ui';
import { BackupReminder } from '../safety';
import { UpiAlert } from '../payments/UpiAlert';
export function Dashboard() {
  const { t } = useTranslation();
  const { firm, settings, error, refresh } = useApp();
  const { navigate } = useNavigation();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey: ['dashboard', firm!.id],
    queryFn: async () => unwrap(await window.api.dashboard.get(firm!.id)),
  });
  if (query.isPending)
    return (
      <div className="stack">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  if (query.isError)
    return (
      <EmptyState
        title={t('error')}
        description={t('localOnly')}
        action={t('retry')}
        onAction={() => void query.refetch()}
      />
    );
  const data = query.data;
  const decimals = Number(settings.decimals ?? 2);
  const cards = [
    { key: 'receive', icon: ArrowDownLeft, tone: 'success' as const },
    { key: 'pay', icon: ArrowUpRight, tone: 'danger' as const },
    { key: 'cash', icon: Wallet },
    { key: 'bank', icon: Landmark },
    { key: 'todaySale', icon: ShoppingBag },
    { key: 'stock', icon: Package },
  ];
  const checks = [
    { key: 'profile', route: 'profile' },
    { key: 'item', route: 'items' },
    { key: 'party', route: 'parties' },
    { key: 'invoice', route: 'invoices/new' },
    { key: 'backup', route: 'backup' },
  ] as const;
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('overview')}</span>
          <h1>{t('welcome', { name: firm!.name })}</h1>
          <p className="muted">{t('dashboardBody')}</p>
        </div>
        <Badge tone="success">
          <span className="status-dot" />
          {t('offline')}
        </Badge>
      </div>
      <BackupReminder />
      {firm?.demo && (
        <InfoBanner id="demo">
          <strong>{t('demoTitle')}</strong>
          <p>{t('demoBody')}</p>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            {t('removeDemo')}
          </Button>
        </InfoBanner>
      )}
      <CustomerAlerts dashboard />
      <InventoryAlerts />
      <UpiAlert />
      <div className="stats-grid">
        {cards.map((card) => (
          <StatCard
            key={card.key}
            label={t(card.key)}
            value={data[card.key as 'cash']}
            icon={<card.icon size={19} />}
            tone={card.tone}
            decimals={decimals}
          />
        ))}
      </div>
      <ReportInsights />
      <div className="dashboard-grid">
        <section className="card checklist">
          <div className="checklist-header">
            <span className="empty-icon small-icon">
              <Check size={22} />
            </span>
            <div>
              <h3>{t('gettingStarted')}</h3>
              <p className="muted small">{t('gettingBody')}</p>
            </div>
          </div>
          <div className="progress-track">
            <span
              style={{
                width: `${checks.filter((check) => data.checklist[check.key]).length * 20}%`,
              }}
            />
          </div>
          {checks.map((check) => (
            <button
              className={`checklist-row ${data.checklist[check.key] ? 'complete' : ''}`}
              key={check.key}
              onClick={() => navigate(check.route)}
            >
              <span className="check-circle">
                {data.checklist[check.key] && <Check size={13} />}
              </span>
              <span>{t(check.key)}</span>
              <ArrowRight size={16} />
            </button>
          ))}
        </section>
      </div>
      <section>
        <h3 className="quick-title">{t('quickActions')}</h3>
        <div className="quick-grid">
          {[
            { route: 'invoices/new', label: 'newSale', icon: ShoppingBag },
            { route: 'bills/new', label: 'newPurchase', icon: ShoppingBag },
            { route: 'items', label: 'item', icon: Package },
            { route: 'parties', label: 'party', icon: Users },
          ].map((action) => (
            <button
              className="card quick-card"
              key={action.route}
              onClick={() => navigate(action.route)}
            >
              <span className="quick-icon">
                <action.icon size={21} />
              </span>
              <strong>{t(action.label)}</strong>
              <Plus size={16} />
            </button>
          ))}
        </div>
      </section>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('removeDemo')}
        onConfirm={() => {
          void (async () => {
            try {
              const id = firm!.id;
              unwrap(await window.api.demo.clear(id));
              setConfirm(false);
              await refresh();
              toast(t('demoCleared'), {
                undo: () => {
                  void (async () => {
                    try {
                      unwrap(await window.api.demo.restore(id));
                      await refresh();
                      toast(t('saved'));
                    } catch (e) {
                      error(e);
                    }
                  })();
                },
              });
            } catch (e) {
              error(e);
            }
          })();
        }}
      >
        {t('demoConfirm')}
      </ConfirmDialog>
    </div>
  );
}
