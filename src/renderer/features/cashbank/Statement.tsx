import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState, MoneyText } from '../../components/ui';
import { useFinance } from './common';
import { unwrap } from '../../../shared/types';
import { formatDate } from '../../../shared/dates';
export function Statement({
  id,
  loan = false,
  onAction,
}: {
  id: number;
  loan?: boolean;
  onAction: () => void;
}) {
  const { t } = useTranslation(),
    { firmId, settings } = useFinance();
  const query = useQuery({
    queryKey: ['statement', firmId, id, loan],
    queryFn: async () =>
      unwrap(
        await (loan
          ? window.api.finance.loanStatement(firmId, id)
          : window.api.finance.statement(firmId, id)),
      ),
  });
  return (
    <section className="card sales-header" data-tour="finance-actions">
      <h3>{t('finance.statement')}</h3>
      {query.isError ? (
        <EmptyState
          title={t('error')}
          description={t('storage')}
          action={t('retry')}
          onAction={() => void query.refetch()}
        />
      ) : !query.data?.length ? (
        <EmptyState
          title={t('finance.emptyStatement')}
          description={t('finance.statementBody')}
          action={t('finance.addEntry')}
          onAction={onAction}
        />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  'date',
                  'description',
                  'incoming',
                  'outgoing',
                  ...(loan ? ['interest'] : []),
                  'balance',
                ].map((k) => (
                  <th key={k}>{t(`finance.${k}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date, settings)}</td>
                  <td>{t(`finance.entry.${r.description}`, { defaultValue: r.description })}</td>
                  <td>
                    <MoneyText value={r.incoming} />
                  </td>
                  <td>
                    <MoneyText value={r.outgoing} />
                  </td>
                  {loan && (
                    <td>
                      <MoneyText value={r.interest ?? 0} />
                    </td>
                  )}
                  <td>
                    <MoneyText value={r.balance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
