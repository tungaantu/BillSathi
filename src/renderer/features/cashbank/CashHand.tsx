import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, MoneyText } from '../../components/ui';
import { useFinance } from './common';
import { Statement } from './Statement';
import { CashDialog, TransferDialog } from './MoneyDialogs';
export function CashHand() {
  const { t } = useTranslation(),
    { banks } = useFinance(),
    [adjust, setAdjust] = useState(false),
    [transfer, setTransfer] = useState(false);
  const cash = banks.find((a) => a.type === 'cash');
  return (
    <div className="stack">
      <div className="page-heading" data-tour="finance-new">
        <h1>{t('nav.cashHand')}</h1>
        <div className="toolbar">
          <Button variant="secondary" onClick={() => setTransfer(true)}>
            {t('finance.transfer')}
          </Button>
          <Button onClick={() => setAdjust(true)}>{t('finance.adjust')}</Button>
        </div>
      </div>
      <section className="card sales-header" data-tour="finance-work">
        <p>{t('finance.balance')}</p>
        <h2>
          <MoneyText value={cash?.balance ?? 0} />
        </h2>
      </section>
      {cash && <Statement id={cash.id} onAction={() => setAdjust(true)} />}
      {adjust && <CashDialog onClose={() => setAdjust(false)} />}
      {transfer && <TransferDialog onClose={() => setTransfer(false)} />}
    </div>
  );
}
