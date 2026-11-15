import { ReportsHome } from '../features/reports/ReportsHome';
import { ReportPage } from '../features/reports/ReportPage';
import { homeTour, pageTour } from '../features/reports/common';
import { Recurring } from '../features/customers/Recurring';
import { CloseYear } from '../features/utilities/CloseYear';
import { BulkItems } from '../features/utilities/BulkItems';
import { fyTour } from '../features/utilities/tours';
import {
  INVENTORY_ROUTES,
  InventoryScreen,
  inventorySteps,
} from '../features/inventory/InventoryScreen';
import { Reminders } from '../features/customers/Reminders';
import { customerTour } from '../features/customers/common';
import { CustomerAlerts } from '../features/customers/CustomerAlerts';
import { BankAccounts } from '../features/cashbank/BankAccounts';
import { CashHand } from '../features/cashbank/CashHand';
import { Cheques } from '../features/cashbank/Cheques';
import { Loans } from '../features/cashbank/Loans';
import { financeTour } from '../features/cashbank/common';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Leaf, Sparkles } from 'lucide-react';
import { APP_NAME } from '../../shared/constants';
import { useApp, useNavigation } from './state';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { routes } from './routes';
import { Badge, Button, EmptyState, Tour, replayTour } from '../components/ui';
import { Dashboard } from '../features/dashboard/Dashboard';
import { Settings } from '../features/settings/Settings';
import { HelpCentre } from '../features/help/HelpCentre';
import { Onboarding } from '../features/onboarding/Onboarding';
import { Parties } from '../features/parties/Parties';
import { Items } from '../features/items/Items';
import { Utilities } from '../features/utilities/Utilities';
import { Sales } from '../features/sales/Sales';
import { salesTour } from '../features/sales/common';
import { SAFETY_ROUTES, SafetyScreen, safetyTour } from '../features/safety';
import { StatementMatch, statementTour } from '../features/payments/StatementMatch';
const masterSteps = [
  { target: '[data-tour="master-new"]', title: 'masters.tourNew', body: 'masters.tourNewBody' },
  { target: '[data-tour="master-list"]', title: 'masters.tourList', body: 'masters.tourListBody' },
  {
    target: '[data-tour="master-detail"]',
    title: 'masters.tourDetail',
    body: 'masters.tourDetailBody',
  },
];
export function App() {
  const { t } = useTranslation();
  const { loading, failed, firm, refresh } = useApp();
  const { route, navigate, setPalette, collapsed } = useNavigation();
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo(0, 0);
  }, [route]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['k', 'f'].includes(key)) {
        e.preventDefault();
        setPalette(true);
      }
      if (e.altKey && ['s', 'p'].includes(key)) {
        e.preventDefault();
        navigate(key === 's' ? 'invoices/new' : 'bills/new');
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [navigate, setPalette]);
  if (failed)
    return (
      <div className="startup">
        <EmptyState
          title={t('error')}
          description={t('localOnly')}
          action={t('retry')}
          onAction={() => void refresh()}
        />
      </div>
    );
  if (loading)
    return (
      <div className="startup">
        <span className="brand-symbol">
          <Leaf size={30} />
        </span>
        <h2>{APP_NAME}</h2>
        <p>{t('loading')}</p>
      </div>
    );
  if (!firm) return <Onboarding />;
  const current = routes.find((r) => r.id === route.split('/')[0]);
  const isSettings = route === 'settings' || route.startsWith('settings/') || route === 'profile';
  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <Sidebar />
      <div className="workspace">
        <TopBar />
        <main className="page-content" data-tour="content" id="main-content">
          <div className="page-inner">
            {route === 'home' ? (
              <Dashboard />
            ) : [
                'invoices',
                'estimates',
                'saleReturns',
                'paymentIn',
                'saleOrders',
                'challans',
                'proforma',
                'bills',
                'paymentOut',
                'purchaseReturns',
                'purchaseOrders',
                'expenses',
                'otherIncome',
              ].includes(route.split('/')[0]) ? (
              <Sales key={firm.id} />
            ) : route.split('/')[0] === 'parties' ? (
              <Parties
                key={`${firm.id}-${route}`}
                selected={Number(route.split('/')[1]) || undefined}
                create={route === 'parties/new'}
              />
            ) : route.split('/')[0] === 'items' ? (
              <Items
                key={`${firm.id}-${route}`}
                selected={Number(route.split('/')[1]) || undefined}
                create={route === 'items/new'}
              />
            ) : route.split('/')[0] === 'reports' ? (
              route === 'reports' ? (
                <ReportsHome />
              ) : (
                <ReportPage
                  key={`${firm.id}-${route}`}
                  id={route.split('/')[1].split('?')[0]}
                  search={route.split('?')[1] ?? ''}
                />
              )
            ) : INVENTORY_ROUTES.includes(route.split('/')[0]) ? (
              <InventoryScreen route={route} firmId={firm.id} />
            ) : route === 'recurring' ? (
              <Recurring />
            ) : route === 'reminders' ? (
              <Reminders />
            ) : route === 'bankAccounts' ? (
              <BankAccounts />
            ) : route === 'cashHand' ? (
              <CashHand />
            ) : route === 'cheques' ? (
              <Cheques />
            ) : route === 'loans' ? (
              <Loans />
            ) : SAFETY_ROUTES.includes(route.split('/')[0]) ? (
              <SafetyScreen key={firm.id} route={route} />
            ) : route === 'bankMatch' ? (
              <StatementMatch key={firm.id} />
            ) : route === 'utilities' ? (
              <Utilities key={firm.id} />
            ) : route === 'closeYear' ? (
              <CloseYear key={firm.id} />
            ) : route === 'bulkItems' ? (
              <BulkItems key={firm.id} />
            ) : isSettings ? (
              <Settings />
            ) : route === 'help' ? (
              <HelpCentre />
            ) : (
              <div className="stack">
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">{APP_NAME}</span>
                    <h1>{current ? t(`nav.${current.id}`) : t('notFound')}</h1>
                    <p className="muted">{current ? t(`module.${current.id}`) : t('notFound')}</p>
                  </div>
                  <Badge>
                    <Sparkles size={14} />
                    {t('phase')}
                  </Badge>
                </div>
                <section className="card coming-soon">
                  <EmptyState
                    title={t('soon')}
                    description={current ? t(`module.${current.id}`) : t('notFound')}
                    action={t('returnHome')}
                    onAction={() => navigate('home')}
                    onHelp={replayTour}
                    icon={current ? <current.icon size={34} /> : undefined}
                  />
                  <div className="coming-footer">
                    <Button variant="ghost" onClick={() => navigate('help')}>
                      {t('nav.help')}
                    </Button>
                    <span>{t('localOnly')}</span>
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
      <CustomerAlerts key={firm.id} />
      <CommandPalette />
      <Tour
        key={`${firm.id}-${route}`}
        screen={
          safetyTour(route)?.screen ??
          (route.startsWith('reports/')
            ? 'reportPage'
            : route === 'settings/print'
              ? route
              : route.split('/')[0])
        }
        steps={
          (route === 'reports' ? homeTour : route.startsWith('reports/') ? pageTour : undefined) ??
          (INVENTORY_ROUTES.includes(route.split('/')[0]) ? inventorySteps(route) : undefined) ??
          (route === 'closeYear' ? fyTour : undefined) ??
          (route === 'bulkItems' ? inventorySteps(route) : undefined) ??
          (['recurring', 'reminders', 'settings/messages', 'settings/party'].includes(route)
            ? customerTour
            : undefined) ??
          safetyTour(route)?.steps ??
          (['bankAccounts', 'cashHand', 'cheques', 'loans'].includes(route)
            ? financeTour
            : route === 'bankMatch'
              ? statementTour
              : ['parties', 'items'].includes(route)
                ? masterSteps
                : [
                      'invoices',
                      'estimates',
                      'saleReturns',
                      'paymentIn',
                      'saleOrders',
                      'challans',
                      'proforma',
                      'challans',
                      'proforma',
                      'bills',
                      'paymentOut',
                      'purchaseReturns',
                      'purchaseOrders',
                      'expenses',
                      'otherIncome',
                    ].includes(route.split('/')[0]) || route === 'settings/print'
                  ? salesTour
                  : undefined)
        }
      />
    </div>
  );
}
