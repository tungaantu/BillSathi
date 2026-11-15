import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  HelpTip,
  MoneyText,
  Select,
  useToast,
} from '../../components/ui';
import { useApp } from '../../app/state';
import { unwrap } from '../../../shared/types';
import { formatINR } from '../../../shared/money';
import type {
  MatchResult,
  PaymentCandidate,
  StatementLine,
  StatementMapping,
  StatementPreview,
} from '../../../shared/payments-api';
import './payments.css';

export const statementTour = [
  {
    target: '[data-tour="stmt-file"]',
    title: 'payments.tour.stmtFile',
    body: 'payments.tour.stmtFileBody',
  },
  {
    target: '[data-tour="stmt-map"]',
    title: 'payments.tour.stmtMap',
    body: 'payments.tour.stmtMapBody',
  },
  {
    target: '[data-tour="stmt-result"]',
    title: 'payments.tour.stmtResult',
    body: 'payments.tour.stmtResultBody',
  },
];
const FIELDS = ['date', 'narration', 'credit', 'debit', 'utr'] as const;
const OPTIONAL = new Set(['debit', 'utr']);

function LineInfo({ line }: { line: StatementLine }) {
  return (
    <div>
      <strong>
        <MoneyText value={line.creditPaise} tone="success" />
      </strong>{' '}
      <span>{line.date}</span>
      <div className="muted">{line.description}</div>
    </div>
  );
}

/** Cash & Bank → Match bank statement. */
export function StatementMatch() {
  const { t } = useTranslation(),
    { firm, error } = useApp(),
    toast = useToast(),
    client = useQueryClient();
  const firmId = firm!.id;
  const [preview, setPreview] = useState<StatementPreview | null>(null),
    [mapping, setMapping] = useState<StatementMapping | null>(null),
    [result, setResult] = useState<MatchResult | null>(null),
    [chosen, setChosen] = useState<Record<number, number>>({}),
    [busy, setBusy] = useState(false),
    [mapError, setMapError] = useState(false),
    [pushNote, setPushNote] = useState('');
  const config = useQuery({
    queryKey: ['payment-config', firmId],
    queryFn: async () => unwrap(await window.api.payments.config(firmId)),
  });
  const canPush = Boolean(config.data?.youpiEnabled && config.data.hasAdminToken);

  async function choose() {
    setBusy(true);
    try {
      const data = unwrap(await window.api.payments.statementOpen(firmId));
      if (!data) return;
      setPreview(data);
      setMapping(data.mapping ?? { date: -1, narration: -1, credit: -1, debit: -1, utr: -1 });
      setResult(null);
      setChosen({});
      setPushNote('');
      setMapError(false);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }

  const complete = (m: StatementMapping | null): m is StatementMapping =>
    Boolean(m && m.date >= 0 && m.narration >= 0 && m.credit >= 0);

  async function find() {
    if (!preview || !complete(mapping)) return setMapError(true);
    setMapError(false);
    setBusy(true);
    try {
      const found = unwrap(
        await window.api.payments.statementMatch(firmId, preview.token, mapping),
      );
      setResult(found);
      // Firm matches start ticked; possible ones wait for the owner's choice.
      setChosen(Object.fromEntries(found.matched.map((m) => [m.line.index, m.candidate.txnId])));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview || !complete(mapping)) return;
    setBusy(true);
    try {
      const picks = Object.entries(chosen).map(([line, txnId]) => ({
        lineIndex: Number(line),
        txnId,
      }));
      const count = unwrap(
        await window.api.payments.statementConfirm(firmId, preview.token, mapping, picks),
      );
      toast(t('payments.statement.confirmed', { count }));
      await client.invalidateQueries();
      await find();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }

  async function push() {
    if (!preview || !complete(mapping)) return;
    setBusy(true);
    try {
      const outcome = unwrap(
        await window.api.payments.statementPush(firmId, preview.token, mapping),
      );
      setPushNote(
        outcome.ok
          ? t('payments.statement.pushDone', {
              reconciled: outcome.reconciled,
              conflicts: outcome.conflicts,
              unmatched: outcome.unmatched,
            })
          : t(`payments.problem.${outcome.problem ?? 'unreachable'}`),
      );
      await client.invalidateQueries();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (line: StatementLine, candidate: PaymentCandidate, on: boolean) =>
    setChosen((c) => {
      const next = { ...c };
      if (on) next[line.index] = candidate.txnId;
      else delete next[line.index];
      return next;
    });
  const taken = (txnId: number, lineIndex: number) =>
    Object.entries(chosen).some(([line, id]) => id === txnId && Number(line) !== lineIndex);
  const selected = Object.keys(chosen).length;
  const headerOptions = (optional: boolean) => [
    ...(optional || !preview ? [{ value: '-1', label: t('payments.statement.none') }] : []),
    ...(preview?.headers ?? []).map((header, index) => ({
      value: String(index),
      label: header || `#${index + 1}`,
    })),
  ];

  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('nav.cashbank')}</span>
          <h1>{t('payments.statement.title')}</h1>
          <p className="muted">{t('payments.statement.body')}</p>
        </div>
        <Button onClick={() => void choose()} disabled={busy}>
          <FileSpreadsheet size={16} />
          {t(preview ? 'payments.statement.another' : 'payments.statement.choose')}
        </Button>
      </div>

      <section className="card stack payments-card" data-tour="stmt-file">
        {preview ? (
          <>
            <strong>
              {t('payments.statement.file', { name: preview.fileName, rows: preview.rowCount })}
            </strong>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {preview.headers.map((header, i) => (
                      <th key={i}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((row, i) => (
                    <tr key={i}>
                      {preview.headers.map((_h, c) => (
                        <td key={c}>{row[c]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">{t('payments.statement.formats')}</p>
        )}
      </section>

      <section className="card stack payments-card" data-tour="stmt-map">
        <h3>
          {t('payments.statement.map')} <HelpTip id="payments-mapping" />
        </h3>
        {mapping && preview ? (
          <div className="statement-map">
            {FIELDS.map((field) => (
              <Field key={field} id={`stmt-${field}`} label={t(`payments.statement.col.${field}`)}>
                <Select
                  label={t(`payments.statement.col.${field}`)}
                  value={String(mapping[field])}
                  options={headerOptions(OPTIONAL.has(field))}
                  onChange={(value) => setMapping({ ...mapping, [field]: Number(value) })}
                />
              </Field>
            ))}
          </div>
        ) : (
          <p className="muted">{t('payments.statement.emptyBody')}</p>
        )}
        {mapError && (
          <p className="field-error" role="alert">
            {t('payments.statement.mapError')}
          </p>
        )}
        {preview && (
          <div className="collect-actions">
            <Button disabled={busy} onClick={() => void find()}>
              {t('payments.statement.match')}
            </Button>
            {canPush && (
              <Button variant="secondary" disabled={busy} onClick={() => void push()}>
                {t('payments.statement.push')}
              </Button>
            )}
          </div>
        )}
        {canPush && preview && <p className="muted">{t('payments.statement.pushHelp')}</p>}
        {pushNote && <p role="status">{pushNote}</p>}
      </section>

      <section className="card stack payments-card" data-tour="stmt-result">
        {!result ? (
          <EmptyState
            title={t('payments.statement.emptyTitle')}
            description={t('payments.statement.emptyBody')}
            action={t('payments.statement.choose')}
            onAction={() => void choose()}
            icon={<FileSpreadsheet size={30} />}
          />
        ) : (
          <>
            <p className="muted">
              {t('payments.statement.summary', {
                credits: result.creditCount,
                open: result.openPayments,
              })}
            </p>
            <h3>
              {t('payments.statement.matched')}{' '}
              <Badge tone="success">{result.matched.length}</Badge>
            </h3>
            <p className="muted">{t('payments.statement.matchedBody')}</p>
            <div className="match-list">
              {!result.matched.length && <p className="muted">{t('payments.statement.nothing')}</p>}
              {result.matched.map((m) => (
                <label className="match-row" key={m.line.index}>
                  <input
                    type="checkbox"
                    checked={chosen[m.line.index] === m.candidate.txnId}
                    onChange={(e) => toggle(m.line, m.candidate, e.target.checked)}
                    aria-label={`${m.candidate.label}`}
                  />
                  <LineInfo line={m.line} />
                  <div>
                    {m.candidate.label}
                    <div className="muted">{t(`payments.statement.reason.${m.reason}`)}</div>
                  </div>
                  <span />
                </label>
              ))}
            </div>

            <h3>
              {t('payments.statement.possible')} <Badge>{result.possible.length}</Badge>
            </h3>
            <p className="muted">{t('payments.statement.possibleBody')}</p>
            <div className="match-list">
              {!result.possible.length && (
                <p className="muted">{t('payments.statement.nothing')}</p>
              )}
              {result.possible.map((p) => {
                const pickable = p.candidates.filter((c) => c.amountPaise === p.line.creditPaise);
                return (
                  <div className="match-row" key={p.line.index}>
                    <span />
                    <LineInfo line={p.line} />
                    <div className="muted">{t(`payments.statement.reason.${p.reason}`)}</div>
                    {pickable.length ? (
                      <Select
                        label={t('payments.statement.pickLabel', {
                          amount: formatINR(p.line.creditPaise),
                          date: p.line.date,
                        })}
                        value={String(chosen[p.line.index] ?? '')}
                        options={[
                          { value: '', label: t('payments.statement.skip') },
                          ...pickable
                            .filter((c) => !taken(c.txnId, p.line.index))
                            .map((c) => ({
                              value: String(c.txnId),
                              label: `${c.label} · ${c.date}`,
                            })),
                        ]}
                        onChange={(value) =>
                          setChosen((c) => {
                            const next = { ...c };
                            if (value) next[p.line.index] = Number(value);
                            else delete next[p.line.index];
                            return next;
                          })
                        }
                      />
                    ) : (
                      <span className="muted">{p.candidates.map((c) => c.label).join(', ')}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <h3>
              {t('payments.statement.unmatched')} <Badge>{result.unmatched.length}</Badge>
            </h3>
            <p className="muted">{t('payments.statement.unmatchedBody')}</p>
            <div className="match-list">
              {!result.unmatched.length && (
                <p className="muted">{t('payments.statement.nothing')}</p>
              )}
              {result.unmatched.map((line) => (
                <div className="match-row" key={line.index}>
                  <span />
                  <LineInfo line={line} />
                  <span />
                  <span />
                </div>
              ))}
            </div>
            <div className="form-actions">
              <Button disabled={busy || !selected} onClick={() => void confirm()}>
                {t('payments.statement.confirm', { count: selected })}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
