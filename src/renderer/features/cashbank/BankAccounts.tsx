import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, EmptyState, MoneyText } from '../../components/ui';
import { FinanceDialog, FinanceField, FinanceMoney, FinanceText, useFinance } from './common';
import { blankBank, type BankAccount } from '../../../shared/finance';
import { unwrap } from '../../../shared/types';
import { Statement } from './Statement';
import { TransferDialog } from './MoneyDialogs';
function BankDialog({ bank, onClose }: { bank: BankAccount | null; onClose: () => void }) {
  const { t } = useTranslation(),
    { firmId } = useFinance(),
    [v, set] = useState(bank ?? blankBank());
  return (
    <FinanceDialog
      title={t(bank ? 'finance.editAccount' : 'finance.addAccount')}
      onClose={onClose}
      onSave={async () => unwrap(await window.api.finance.saveAccount(firmId, bank?.id ?? null, v))}
    >
      <div className="form-grid">
        {(['name', 'bankName', 'accountNumber', 'ifsc', 'upiId'] as const).map((k) => (
          <FinanceText
            key={k}
            name={k}
            value={v[k]}
            onChange={(value) => set({ ...v, [k]: k === 'ifsc' ? value.toUpperCase() : value })}
          />
        ))}
        <FinanceMoney
          name="openingBalance"
          value={v.openingBalance}
          onChange={(openingBalance) => set({ ...v, openingBalance })}
        />
        <FinanceText
          name="openingDate"
          type="date"
          value={v.openingDate}
          onChange={(openingDate) => set({ ...v, openingDate })}
        />
        {(['printOnInvoice', 'isDefault'] as const).map((k) => (
          <FinanceField key={k} name={k}>
            <Checkbox
              label={t(`finance.${k}`)}
              checked={v[k]}
              onCheckedChange={(value) => set({ ...v, [k]: value })}
            />
          </FinanceField>
        ))}
      </div>
    </FinanceDialog>
  );
}
export function BankAccounts() {
  const { t } = useTranslation(),
    { banks, accountQuery } = useFinance();
  const [edit, setEdit] = useState<BankAccount | null | undefined>(undefined),
    [selected, setSelected] = useState(0),
    [transfer, setTransfer] = useState(false);
  const accounts = banks.filter((a) => a.type === 'bank');
  return (
    <div className="stack">
      <div className="page-heading" data-tour="finance-new">
        <h1>{t('nav.bankAccounts')}</h1>
        <div className="toolbar">
          <Button variant="secondary" onClick={() => setTransfer(true)}>
            {t('finance.transfer')}
          </Button>
          <Button onClick={() => setEdit(null)}>{t('finance.addAccount')}</Button>
        </div>
      </div>
      <div className="finance-cards" data-tour="finance-work">
        {accountQuery.isError ? (
          <EmptyState
            title={t('error')}
            description={t('storage')}
            action={t('retry')}
            onAction={() => void accountQuery.refetch()}
          />
        ) : !accounts.length ? (
          <EmptyState
            title={t('finance.emptyAccounts')}
            description={t('finance.accountsBody')}
            action={t('finance.addAccount')}
            onAction={() => setEdit(null)}
          />
        ) : (
          accounts.map((a) => (
            <section className="card sales-header stack" key={a.id}>
              <h3>{a.name}</h3>
              <p>
                {a.bankName} · {a.accountNumber ? `•••• ${a.accountNumber.slice(-4)}` : ''}
              </p>
              <p className="muted">
                {a.ifsc} {a.upiId}
              </p>
              <MoneyText value={a.balance} />
              <div className="toolbar">
                <Button variant="secondary" onClick={() => setSelected(a.id)}>
                  {t('finance.statement')}
                </Button>
                <Button variant="ghost" onClick={() => setEdit(a)}>
                  {t('edit')}
                </Button>
                {a.isDefault && <span className="badge">{t('finance.isDefault')}</span>}
              </div>
            </section>
          ))
        )}
      </div>
      {selected ? (
        <Statement id={selected} onAction={() => setTransfer(true)} />
      ) : (
        <div data-tour="finance-actions">
          <p className="muted">{t('finance.chooseStatement')}</p>
        </div>
      )}
      {edit !== undefined && <BankDialog bank={edit} onClose={() => setEdit(undefined)} />}
      {transfer && <TransferDialog onClose={() => setTransfer(false)} />}
    </div>
  );
}
