import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Input, MoneyText, Select } from '../../components/ui';
import {
  AccountSelect,
  FinanceDialog,
  FinanceField,
  FinanceMoney,
  FinanceText,
  useFinance,
} from './common';
import { Statement } from './Statement';
import { unwrap } from '../../../shared/types';
import { today } from '../../../shared/masters';
import type { Loan } from '../../../shared/finance';
function LoanDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    { firmId, parties } = useFinance();
  const [v, set] = useState({
    name: '',
    partyId: null as number | null,
    amount: 0,
    interestBps: 0,
    accountId: 0,
    date: today(),
  });
  return (
    <FinanceDialog
      title={t('finance.takeLoan')}
      onClose={onClose}
      onSave={async () => unwrap(await window.api.finance.loan(firmId, v))}
    >
      <FinanceText name="lender" value={v.name} onChange={(name) => set({ ...v, name })} />
      <FinanceField name="party">
        <Select
          label={t('finance.party')}
          value={String(v.partyId ?? '')}
          options={[
            { value: '', label: t('finance.optional') },
            ...parties.map((p) => ({ value: String(p.id), label: p.name })),
          ]}
          onChange={(p) => set({ ...v, partyId: p ? Number(p) : null })}
        />
      </FinanceField>
      <FinanceMoney name="amount" value={v.amount} onChange={(amount) => set({ ...v, amount })} />
      <FinanceField name="interestRate">
        <Input
          id="finance-interestRate"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={v.interestBps / 100}
          onChange={(e) => set({ ...v, interestBps: Math.round(Number(e.target.value) * 100) })}
        />
      </FinanceField>
      <AccountSelect
        name="account"
        value={v.accountId}
        onChange={(accountId) => set({ ...v, accountId })}
      />
      <FinanceText
        name="date"
        type="date"
        value={v.date}
        onChange={(date) => set({ ...v, date })}
      />
    </FinanceDialog>
  );
}
function EmiDialog({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const { t } = useTranslation(),
    { firmId } = useFinance();
  const [v, set] = useState({
    loanId: loan.id,
    principal: 0,
    interest: 0,
    accountId: 0,
    date: today(),
    description: '',
  });
  return (
    <FinanceDialog
      title={t('finance.recordEmi')}
      onClose={onClose}
      onSave={async () => unwrap(await window.api.finance.emi(firmId, v))}
    >
      <p>
        {loan.name} · {t('finance.balance')}: <MoneyText value={loan.balance} />
      </p>
      <FinanceMoney
        name="principal"
        value={v.principal}
        onChange={(principal) => set({ ...v, principal })}
      />
      <FinanceMoney
        name="interest"
        value={v.interest}
        onChange={(interest) => set({ ...v, interest })}
      />
      <AccountSelect
        name="account"
        value={v.accountId}
        onChange={(accountId) => set({ ...v, accountId })}
      />
      <FinanceText
        name="date"
        type="date"
        value={v.date}
        onChange={(date) => set({ ...v, date })}
      />
      <FinanceText
        name="description"
        value={v.description}
        onChange={(description) => set({ ...v, description })}
      />
    </FinanceDialog>
  );
}
export function Loans() {
  const { t } = useTranslation(),
    { firmId } = useFinance();
  const query = useQuery({
    queryKey: ['loans', firmId],
    queryFn: async () => unwrap(await window.api.finance.loans(firmId)),
  });
  const [add, setAdd] = useState(false),
    [emi, setEmi] = useState<Loan | null>(null),
    [selected, setSelected] = useState(0);
  return (
    <div className="stack">
      <div className="page-heading" data-tour="finance-new">
        <h1>{t('nav.loans')}</h1>
        <Button onClick={() => setAdd(true)}>{t('finance.takeLoan')}</Button>
      </div>
      <div className="finance-cards" data-tour="finance-work">
        {query.isError ? (
          <EmptyState
            title={t('error')}
            description={t('storage')}
            action={t('retry')}
            onAction={() => void query.refetch()}
          />
        ) : !query.data?.length ? (
          <EmptyState
            title={t('finance.emptyLoans')}
            description={t('finance.loanBody')}
            action={t('finance.takeLoan')}
            onAction={() => setAdd(true)}
          />
        ) : (
          query.data.map((l) => (
            <section className="card sales-header stack" key={l.id}>
              <h3>{l.name}</h3>
              <p>
                {t('finance.interestRate')}: {l.interestBps / 100}%
              </p>
              <MoneyText value={l.balance} />
              <div className="toolbar">
                <Button disabled={l.balance <= 0} onClick={() => setEmi(l)}>
                  {t('finance.recordEmi')}
                </Button>
                <Button variant="secondary" onClick={() => setSelected(l.id)}>
                  {t('finance.statement')}
                </Button>
              </div>
            </section>
          ))
        )}
      </div>
      {selected ? (
        <Statement
          id={selected}
          loan
          onAction={() => setEmi(query.data?.find((l) => l.id === selected) ?? null)}
        />
      ) : (
        <div data-tour="finance-actions">
          <p className="muted">{t('finance.chooseStatement')}</p>
        </div>
      )}
      {add && <LoanDialog onClose={() => setAdd(false)} />}
      {emi && <EmiDialog loan={emi} onClose={() => setEmi(null)} />}
    </div>
  );
}
