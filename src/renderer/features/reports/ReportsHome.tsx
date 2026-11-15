import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Star,
  Search,
  Users,
  Package,
  Landmark,
  Percent,
  Receipt,
  ClipboardList,
} from 'lucide-react';
import { REPORTS, REPORT_SECTIONS, type ReportDef } from '../../../shared/reports';
import { useApp, useNavigation } from '../../app/state';
import { Button, EmptyState, IconButton, Input } from '../../components/ui';
import { reportIds } from './common';
import './reports.css';

const icons = {
  transactions: BookOpen,
  party: Users,
  gst: Percent,
  item: Package,
  business: Landmark,
  expense: Receipt,
  orders: ClipboardList,
};
export function ReportsHome() {
  const { t } = useTranslation();
  const { settings, saveSetting, error } = useApp();
  const { navigate } = useNavigation();
  const [search, setSearch] = useState('');
  const favourites = reportIds(settings, 'favourites'),
    recent = reportIds(settings, 'recent');
  const matches = (r: ReportDef) =>
    `${t(`reports.name.${r.id}`)} ${t(`reports.desc.${r.id}`)}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase());
  const reports = REPORTS.filter((r) => (r.section !== 'orders' || settings.orders) && matches(r));
  const card = (r: ReportDef) => {
    const Icon = icons[r.section],
      pinned = favourites.includes(r.id);
    return (
      <article className="card report-card" key={r.id}>
        <span className="stat-icon">
          <Icon size={22} />
        </span>
        <button className="report-card-open" onClick={() => navigate(`reports/${r.id}`)}>
          <strong>{t(`reports.name.${r.id}`)}</strong>
          <span className="muted small">{t(`reports.desc.${r.id}`)}</span>
        </button>
        <IconButton
          label={t(pinned ? 'reports.unpin' : 'reports.pin')}
          aria-pressed={pinned}
          onClick={() =>
            void saveSetting(
              'reports.favourites',
              (pinned ? favourites.filter((id) => id !== r.id) : [...favourites, r.id]).join(','),
              true,
            ).catch(error)
          }
        >
          <Star size={18} fill={pinned ? 'currentColor' : 'none'} />
        </IconButton>
      </article>
    );
  };
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('reports.intro')}</span>
          <h1>{t('reports.title')}</h1>
        </div>
      </div>
      <div className="report-search" data-tour="report-search">
        <Search size={20} />
        <Input
          aria-label={t('reports.search')}
          placeholder={t('reports.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div data-tour="report-pins" className="stack">
        {[
          ['favourites', favourites],
          ['recent', recent],
        ].map(([key, ids]) => {
          const rows = (ids as string[])
            .map((id) => reports.find((r) => r.id === id))
            .filter((r): r is ReportDef => Boolean(r));
          return rows.length ? (
            <section key={String(key)}>
              <h2>{t(`reports.${key}`)}</h2>
              <div className="reports-grid">{rows.map(card)}</div>
            </section>
          ) : null;
        })}
        {!favourites.length && <p className="muted small">{t('reports.tour.pinsBody')}</p>}
      </div>
      <div data-tour="report-cards" className="stack">
        {REPORT_SECTIONS.map((section) => {
          const rows = reports.filter((r) => r.section === section);
          return rows.length ? (
            <section key={section}>
              <h2>{t(`reports.section.${section}`)}</h2>
              <div className="reports-grid">{rows.map(card)}</div>
            </section>
          ) : null;
        })}
        {!reports.length && (
          <EmptyState
            title={t('reports.noMatch')}
            description={t('reports.intro')}
            action={t('reports.clearSearch')}
            onAction={() => setSearch('')}
          />
        )}
      </div>
      <Button variant="ghost" onClick={() => navigate('help')}>
        {t('nav.help')}
      </Button>
    </div>
  );
}
