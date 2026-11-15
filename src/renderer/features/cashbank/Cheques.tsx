import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, MoneyText, Select, Checkbox } from '../../components/ui';
import { FinanceDialog, FinanceField, FinanceText, useFinance } from './common';
import { useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import { formatDate } from '../../../shared/dates';
import { today } from '../../../shared/masters';
import type { Cheque, ChequeAction } from '../../../shared/finance';
function ChequeDialog({
  cheque,
  action,
  onClose,
}: {
  cheque: Cheque;
  action: ChequeAction;
  onClose: () => void;
}) {
  const { t } = useTranslation(),
    { firmId, banks } = useFinance();
  const [date, setDate] = useState(today()),
    [bank, setBank] = useState(cheque.settledAccountId ?? 0),
    [confirmed, setConfirmed] = useState(false);
  return (
    <FinanceDialog
      title={t(`finance.${action}`)}
      onClose={onClose}
      onSave={async () => {
        if (action === 'bounced' && !confirmed) {
          throw new Error('validation');
        }
        return unwrap(
          await window.api.finance.cheque(firmId, cheque.id, action, date, bank || null),
        );
      }}
    >
      <p>
        {cheque.number} · <MoneyText value={cheque.amount} />
      </p>
      <FinanceText name="actionDate" type="date" value={date} onChange={setDate} />
      {action !== 'bounced' && (
        <FinanceField name="account">
          <Select
            label={t('finance.account')}
            value={String(bank || '')}
            options={banks
              .filter((a) => a.type === 'bank')
              .map((a) => ({ value: String(a.id), label: a.name }))}
            onChange={(v) => setBank(Number(v))}
          />
        </FinanceField>
      )}
      {action === 'bounced' && (
        <>
          <p>{t('finance.bounceBody')}</p>
          <Checkbox
            checked={confirmed}
            onCheckedChange={setConfirmed}
            label={t('finance.confirmBounce')}
          />
        </>
      )}
    </FinanceDialog>
  );
}
export function Cheques() {
  const { t } = useTranslation(),
    { firmId, settings } = useFinance(),
    { navigate } = useNavigation();
  const [status, setStatus] = useState(''),
    [direction, setDirection] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [selected, setSelected] = useState<{ cheque: Cheque; action: ChequeAction } | null>(null);
  const query = useQuery({
    queryKey: ['cheques', firmId],
    queryFn: async () => unwrap(await window.api.finance.cheques(firmId)),
  });
  const rows = (query.data ?? []).filter(
    (c) =>
      (!status || c.status === status) &&
      (!direction || c.direction === direction) &&
      (!from || c.date >= from) &&
      (!to || c.date <= to),
  );
  return (
    <div className="stack">
      <div className="page-heading" data-tour="finance-new">
        <h1>{t('nav.cheques')}</h1>
        <Button onClick={() => navigate('paymentIn/new')}>{t('finance.newCheque')}</Button>
      </div>
      <div className="card sales-header form-grid" data-tour="finance-work">
        <FinanceField name="status">
          <Select
            label={t('finance.status')}
            value={status}
            options={['', 'open', 'deposited', 'withdrawn', 'cleared', 'bounced'].map((value) => ({
              value,
              label: value
                ? t(`finance.status.${value}`, { defaultValue: t(`finance.${value}`) })
                : t('finance.all'),
            }))}
            onChange={setStatus}
          />
        </FinanceField>
        <FinanceField name="direction">
          <Select
            label={t('finance.direction')}
            value={direction}
            options={['', 'in', 'out'].map((value) => ({
              value,
              label: value
                ? t(`finance.status.${value}`, { defaultValue: t(`finance.${value}`) })
                : t('finance.all'),
            }))}
            onChange={setDirection}
          />
        </FinanceField>
        <FinanceText name="fromDate" type="date" value={from} onChange={setFrom} />
        <FinanceText name="toDate" type="date" value={to} onChange={setTo} />
      </div>
      <section className="card sales-header" data-tour="finance-actions">
        {query.isError ? (
          <EmptyState
            title={t('error')}
            description={t('storage')}
            action={t('retry')}
            onAction={() => void query.refetch()}
          />
        ) : !rows.length ? (
          <EmptyState
            title={t('finance.emptyCheques')}
            description={t('finance.chequeBody')}
            action={t('finance.newCheque')}
            onAction={() => navigate('paymentIn/new')}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {['number', 'date', 'direction', 'amount', 'status', 'actions'].map((k) => (
                    <th key={k}>{t(`finance.${k}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>{c.number}</td>
                    <td>{formatDate(c.date, settings)}</td>
                    <td>{t(`finance.${c.direction}`)}</td>
                    <td>
                      <MoneyText value={c.amount} />
                    </td>
                    <td>
                      <span className="badge">{t(`finance.status.${c.status}`)}</span>
                      {c.actionDate && (
                        <p className="small">{formatDate(c.actionDate, settings)}</p>
                      )}
                    </td>
                    <td>
                      <div className="toolbar">
                        {!['cleared', 'bounced'].includes(c.status) &&
                          (
                            [
                              ...(c.status === 'open'
                                ? [c.direction === 'in' ? 'deposited' : 'withdrawn']
                                : []),
                              'cleared',
                              'bounced',
                            ] as ChequeAction[]
                          ).map((action) => (
                            <Button
                              variant="secondary"
                              key={action}
                              onClick={() => setSelected({ cheque: c, action })}
                            >
                              {t(`finance.${action}`)}
                            </Button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <ChequeDialog
          key={`${selected.cheque.id}-${selected.action}`}
          {...selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
