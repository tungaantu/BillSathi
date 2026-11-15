import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '../../components/ui';
import {
  AccountSelect,
  FinanceDialog,
  FinanceField,
  FinanceMoney,
  FinanceText,
  useFinance,
} from './common';
import { today } from '../../../shared/masters';
import { unwrap } from '../../../shared/types';
export function TransferDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    { firmId } = useFinance();
  const [v, set] = useState({ fromId: 0, toId: 0, amount: 0, date: today(), description: '' });
  return (
    <FinanceDialog
      title={t('finance.transfer')}
      onClose={onClose}
      onSave={async () => unwrap(await window.api.finance.transfer(firmId, v))}
    >
      <div className="transfer-flow">
        <AccountSelect name="from" value={v.fromId} onChange={(fromId) => set({ ...v, fromId })} />
        <span aria-hidden="true">→</span>
        <AccountSelect name="to" value={v.toId} onChange={(toId) => set({ ...v, toId })} />
      </div>
      <FinanceMoney name="amount" value={v.amount} onChange={(amount) => set({ ...v, amount })} />
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
export function CashDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    { firmId } = useFinance();
  const [v, set] = useState({ amount: 0, direction: 1 as 1 | -1, date: today(), description: '' });
  return (
    <FinanceDialog
      title={t('finance.adjust')}
      onClose={onClose}
      onSave={async () => unwrap(await window.api.finance.adjust(firmId, v))}
    >
      <FinanceField name="direction">
        <Select
          label={t('finance.direction')}
          value={String(v.direction)}
          options={[
            { value: '1', label: t('finance.addCash') },
            { value: '-1', label: t('finance.reduceCash') },
          ]}
          onChange={(d) => set({ ...v, direction: Number(d) as 1 | -1 })}
        />
      </FinanceField>
      <FinanceMoney name="amount" value={v.amount} onChange={(amount) => set({ ...v, amount })} />
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
