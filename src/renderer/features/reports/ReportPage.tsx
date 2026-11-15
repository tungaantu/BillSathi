import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileSpreadsheet, Printer, Download, RefreshCw } from 'lucide-react';
import { resolvePreset, type DatePreset } from '../../../shared/report-dates';
import { today } from '../../../shared/masters';
import { unwrap } from '../../../shared/types';
import { formatCell } from '../../../shared/report-format';
import { reportDef, type ReportFilters as Filters, type ReportsApi } from '../../../shared/reports';
import { useApp, useNavigation } from '../../app/state';
import { Button, EmptyState, HelpTip, Skeleton, useToast } from '../../components/ui';
import { reportIds } from './common';
import { ReportFilters } from './ReportFilters';
import { ReportTable } from './ReportTable';
import './reports.css';

export function ReportPage({ id, search }: { id: string; search: string }) {
  const { t } = useTranslation(),
    { firm, settings, saveSetting, error } = useApp(),
    { navigate } = useNavigation(),
    toast = useToast();
  const [preset, setPreset] = useState<DatePreset>('month');
  const defaults = (): Filters => ({
    ...resolvePreset('month', today()),
    asOn: today(),
    side: 'sale',
  });
  const [filters, setFilters] = useState<Filters>(() => {
    const params = new URLSearchParams(search),
      f = defaults();
    for (const key of ['from', 'to', 'asOn'] as const)
      if (params.get(key)) f[key] = params.get(key)!;
    if (params.get('partyId')) f.partyId = Number(params.get('partyId'));
    if (params.get('due') === 'overdue') {
      f.due = 'overdue';
      f.from = '2000-01-01';
      f.to = today();
    }
    return f;
  });
  const [busy, setBusy] = useState(false);
  const def = reportDef(id);
  const query = useQuery({
    queryKey: ['report', firm!.id, id, filters],
    queryFn: async () => unwrap(await window.api.reports.run(firm!.id, id, filters)),
    enabled: Boolean(def),
  });
  // Remember this report as "recently used" once per opened report. Reads the latest settings via a
  // ref: saveSetting/settings change identity on every save, so listing them as deps would loop.
  const latest = useRef({ settings, saveSetting, error });
  useEffect(() => {
    latest.current = { settings, saveSetting, error };
  });
  useEffect(() => {
    const { settings: s, saveSetting: save, error: fail } = latest.current;
    const recent = reportIds(s, 'recent');
    if (reportDef(id) && recent[0] !== id)
      void save(
        'reports.recent',
        [id, ...recent.filter((r) => r !== id)].slice(0, 8).join(','),
        true,
      ).catch(fail);
  }, [id]);
  async function output(kind: 'exportExcel' | 'exportPdf' | 'print' | 'gstr1Json' | 'gstr1Excel') {
    setBusy(true);
    try {
      const api: ReportsApi = window.api.reports;
      const result = unwrap(
        await (kind === 'gstr1Json' || kind === 'gstr1Excel'
          ? api[kind](firm!.id, filters)
          : api[kind](firm!.id, id, filters)),
      );
      if (result.path) toast(t('reports.exported'));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  if (!def)
    return (
      <EmptyState
        title={t('notFound')}
        description={t('reports.intro')}
        action={t('reports.title')}
        onAction={() => navigate('reports')}
      />
    );
  const result = query.data,
    invalidFiling = Boolean(result?.issues?.some((i) => i.severity === 'error'));
  const reset = () => {
    setFilters(defaults());
    setPreset('month');
  };
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <Button variant="ghost" onClick={() => navigate('reports')}>
            <ArrowLeft size={16} />
            {t('reports.title')}
          </Button>
          <h1 aria-label={t(`reports.name.${id}`)}>
            {t(`reports.name.${id}`)} <HelpTip id={`report.${id}`} />
          </h1>
          <p className="muted">{t(`reports.desc.${id}`)}</p>
        </div>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          <RefreshCw size={16} />
          {t('reports.refresh')}
        </Button>
      </div>
      <ReportFilters
        def={def}
        filters={filters}
        onChange={setFilters}
        preset={preset}
        setPreset={setPreset}
      />
      <div className="report-exports" data-tour="report-export">
        <Button
          variant="secondary"
          disabled={busy || !result || query.isFetching}
          onClick={() => void output('exportExcel')}
        >
          <FileSpreadsheet size={16} />
          {t('reports.excel')}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !result || query.isFetching}
          onClick={() => void output('exportPdf')}
        >
          <Download size={16} />
          {t('reports.pdf')}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || !result || query.isFetching}
          onClick={() => void output('print')}
        >
          <Printer size={16} />
          {t('reports.print')}
        </Button>
        {id === 'gstr1' && (
          <>
            <Button
              disabled={busy || !result || invalidFiling || query.isFetching}
              onClick={() => void output('gstr1Json')}
            >
              {t('reports.json')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !result || invalidFiling || query.isFetching}
              onClick={() => void output('gstr1Excel')}
            >
              {t('reports.offlineExcel')}
            </Button>
          </>
        )}
      </div>
      {query.isPending ? (
        <Skeleton />
      ) : query.isError ? (
        <EmptyState
          title={t('error')}
          description={t('validation')}
          action={t('reports.reset')}
          onAction={reset}
        />
      ) : (
        result && (
          <>
            <div className="report-summary">
              {result.summary.map((s) => (
                <div className="card" key={s.key}>
                  <span className="muted small">{t(s.label)}</span>
                  <strong className={`money ${s.tone ?? ''}`}>
                    {formatCell(
                      s.value,
                      { key: s.key, label: s.label, type: s.type },
                      (k) => t(k),
                      settings,
                    )}
                  </strong>
                </div>
              ))}
            </div>
            {Boolean(result.issues?.length) && (
              <section className="card report-issues">
                <h2>{t('reports.fixTitle')}</h2>
                <p className="muted">{t('reports.fixBody')}</p>
                <ul>
                  {result.issues!.map((issue, i) => (
                    <li key={i}>
                      <button onClick={() => navigate(issue.link)}>
                        {issue.docNumber} · {t(issue.code)} {issue.detail}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {result.tabs && (
              <div className="report-tabs" role="tablist" aria-label={t('reports.name.gstr1')}>
                {result.tabs.map((tab) => (
                  <Button
                    key={tab.id}
                    role="tab"
                    aria-selected={(filters.tab ?? 'b2b') === tab.id}
                    variant={(filters.tab ?? 'b2b') === tab.id ? 'primary' : 'secondary'}
                    onClick={() => setFilters({ ...filters, tab: tab.id })}
                  >
                    {t(`reports.tab.${tab.id}`)} ({tab.count})
                  </Button>
                ))}
              </div>
            )}
            {result.rows.length ? (
              <>
                <p className="muted small">{t('reports.rows', { count: result.rows.length })}</p>
                <ReportTable result={result} />
              </>
            ) : (
              <div data-tour="report-table" className="card">
                <EmptyState
                  title={t('reports.empty')}
                  description={t('reports.emptyBody')}
                  action={t('reports.reset')}
                  onAction={reset}
                />
              </div>
            )}
            {result.notes.map((note) => (
              <p key={note} className="muted small">
                {t(note)}
              </p>
            ))}
          </>
        )
      )}
    </div>
  );
}
