import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { unwrap } from '../../../shared/types';
import { displayDocumentNumber } from '../../../shared/numbering';
import { formatINR } from '../../../shared/money';
import {
  auditLabel,
  diffRecords,
  humanizeField,
  isMoneyField,
  parseAudit,
} from '../../../shared/audit';
import type { AuditRow } from '../../../shared/safety-api';
import {
  Badge,
  Button,
  EmptyState,
  HelpTip,
  Input,
  Select,
  Sheet,
  Skeleton,
} from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { formatWhen } from './format';

const ACTIONS = [
  'create',
  'update',
  'delete',
  'restore',
  'purge',
  'cancel',
  'reopen',
  'close',
  'convert',
];
const pad = (prefix: string, n: number) =>
  displayDocumentNumber({ firmId: 0, type: '', prefix, number: n });

function describe(row: AuditRow) {
  const before = parseAudit(row.before),
    after = parseAudit(row.after);
  return {
    before,
    after,
    label: auditLabel(row.entity, before, after, pad),
    changes: diffRecords(before, after),
  };
}
function money(path: string, value: string | null) {
  if (value === null || value === '') return '—';
  return isMoneyField(path) && /^-?\d+$/.test(value) ? formatINR(Number(value)) : value;
}

export function AuditTrail() {
  const { t, i18n } = useTranslation();
  const { firm, settings } = useApp();
  const { navigate } = useNavigation();
  const firmId = firm!.id;
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [entity, setEntity] = useState(''),
    [action, setAction] = useState(''),
    [limit, setLimit] = useState(200),
    [open, setOpen] = useState<AuditRow | null>(null);
  const entities = useQuery({
    queryKey: ['audit-entities', firmId],
    queryFn: async () => unwrap(await window.api.safety.audit.entities(firmId)),
  });
  const query = useQuery({
    queryKey: ['audit', firmId, from, to, entity, action, limit],
    queryFn: async () =>
      unwrap(
        await window.api.safety.audit.list(firmId, {
          from: from || undefined,
          to: to || undefined,
          entity: entity || undefined,
          action: action || undefined,
          limit,
        }),
      ),
  });
  const rows = useMemo(
    () => (query.data ?? []).map((row) => ({ row, ...describe(row) })),
    [query.data],
  );
  const entityName = (name: string) => t(`safety.entity.${name}`, { defaultValue: name });
  const what = (r: (typeof rows)[number]) =>
    r.label.kind === 'doc'
      ? `${t(`sales.type.${r.label.docType}`, { defaultValue: entityName(r.row.entity) })} ${r.label.text}`
      : r.label.text
        ? `${entityName(r.row.entity)} ${r.label.text}`
        : entityName(r.row.entity);
  const summary = (r: (typeof rows)[number]) =>
    t(`safety.audit.summary.${r.row.action}`, {
      defaultValue: t('safety.audit.summary.other', { action: r.row.action, what: what(r) }),
      what: what(r),
      count: r.changes.length,
    });
  const filtered = Boolean(from || to || entity || action);
  const current = open ? rows.find((r) => r.row.id === open.id) : undefined;
  return (
    <div className="stack">
      <div className="page-heading" data-tour="safety-head">
        <div>
          <span className="eyebrow">{t('nav.utilities')}</span>
          <h1>
            {t('nav.auditTrail')} <HelpTip id="safetyAudit" />
          </h1>
          <p className="muted">{t('safety.audit.intro')}</p>
        </div>
        {settings.auditTrail === false && <Badge tone="warning">{t('safety.audit.off')}</Badge>}
      </div>
      <div className="card audit-filters" data-tour="safety-actions">
        <label className="field">
          <span className="field-label">{t('safety.audit.from')}</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('safety.audit.to')}</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="field">
          <span className="field-label">{t('safety.audit.entity')}</span>
          <Select
            label={t('safety.audit.entity')}
            value={entity}
            onChange={setEntity}
            options={[
              { value: '', label: t('sales.all') },
              ...(entities.data ?? []).map((v) => ({ value: v, label: entityName(v) })),
            ]}
          />
        </div>
        <div className="field">
          <span className="field-label">{t('safety.audit.action')}</span>
          <Select
            label={t('safety.audit.action')}
            value={action}
            onChange={setAction}
            options={[
              { value: '', label: t('sales.all') },
              ...ACTIONS.map((v) => ({ value: v, label: t(`safety.action.${v}`) })),
            ]}
          />
        </div>
      </div>
      <section className="card" data-tour="safety-main">
        {query.isPending ? (
          <Skeleton />
        ) : !rows.length ? (
          filtered ? (
            <EmptyState
              title={t('safety.audit.noMatch')}
              description={t('safety.audit.noMatchBody')}
              action={t('safety.audit.clear')}
              onAction={() => {
                setFrom('');
                setTo('');
                setEntity('');
                setAction('');
              }}
            />
          ) : settings.auditTrail === false ? (
            <EmptyState
              title={t('safety.audit.offTitle')}
              description={t('safety.audit.offBody')}
              action={t('safety.audit.turnOn')}
              onAction={() => navigate('settings/general')}
            />
          ) : (
            <EmptyState
              title={t('safety.audit.emptyTitle')}
              description={t('safety.audit.emptyBody')}
              action={t('sales.new')}
              onAction={() => navigate('invoices/new')}
            />
          )
        ) : (
          <div className="table-scroll" data-tour="safety-list">
            <table>
              <thead>
                <tr>
                  {['when', 'action', 'entity', 'summary'].map((k) => (
                    <th key={k}>{t(`safety.audit.col.${k}`)}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row.id}>
                    <td>{formatWhen(r.row.at, i18n.language)}</td>
                    <td>
                      <Badge tone={['delete', 'purge'].includes(r.row.action) ? 'danger' : ''}>
                        {t(`safety.action.${r.row.action}`, { defaultValue: r.row.action })}
                      </Badge>
                    </td>
                    <td>{entityName(r.row.entity)}</td>
                    <td>{summary(r)}</td>
                    <td>
                      <Button variant="secondary" onClick={() => setOpen(r.row)}>
                        {t('safety.audit.details')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length >= limit && (
              <div className="form-actions">
                <Button variant="secondary" onClick={() => setLimit(limit + 200)}>
                  {t('safety.audit.more')}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
      <Sheet
        open={current !== undefined}
        onOpenChange={(v) => !v && setOpen(null)}
        title={t('safety.audit.detailsTitle')}
        description={current ? summary(current) : undefined}
        className="audit-drawer"
      >
        {current && (
          <div className="stack">
            <p className="muted">
              {formatWhen(current.row.at, i18n.language)} · {current.row.actor}
            </p>
            {current.changes.length ? (
              <div className="table-scroll">
                <table className="diff-table">
                  <thead>
                    <tr>
                      <th>{t('safety.audit.field')}</th>
                      <th>{t('safety.audit.before')}</th>
                      <th>{t('safety.audit.after')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.changes.map((c) => (
                      <tr key={c.path} className={c.kind}>
                        <td>{humanizeField(c.path)}</td>
                        <td className="before">{money(c.path, c.before)}</td>
                        <td className="after">{money(c.path, c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{t('safety.audit.nothingChanged')}</p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
