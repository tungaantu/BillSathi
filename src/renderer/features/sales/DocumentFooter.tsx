import { useTranslation } from 'react-i18next';
import { Button, HelpTip, Input, MoneyInput, MoneyText, Select } from '../../components/ui';
import { SaleField, SaleMoney, SaleText, useSales } from './common';
import { sumPaise } from '../../../shared/money';
import { DOCUMENT_CONFIG, type SaleDocument } from '../../../shared/sales';
import type { calculateInvoice } from '../../../shared/gst-calc';
import { unwrap } from '../../../shared/types';
export function DocumentFooter({
  doc,
  update,
  calculated,
}: {
  doc: SaleDocument;
  update: (patch: Partial<SaleDocument>) => void;
  calculated: ReturnType<typeof calculateInvoice>;
}) {
  const { t } = useTranslation(),
    { accounts, settings, firmId, error } = useSales();
  const received = sumPaise(doc.payments.map((p) => p.amount));
  const posting = DOCUMENT_CONFIG[doc.type].payments !== 'none';
  async function attach() {
    try {
      const file = unwrap(await window.api.sales.attach(firmId));
      if (file) update({ attachmentIds: [...doc.attachmentIds, file.id] });
    } catch (e) {
      error(e);
    }
  }
  return (
    <section className="sales-footer">
      <div className="card stack">
        <SaleText
          name="description"
          value={doc.description}
          onChange={(description) => update({ description })}
        />
        <SaleField name="terms">
          <textarea
            className="input"
            id="sale-terms"
            rows={3}
            value={doc.terms}
            onChange={(e) => update({ terms: e.target.value })}
          />
        </SaleField>
        <div className="toolbar">
          <Button variant="secondary" onClick={() => void attach()}>
            {t('sales.attach')}
          </Button>
          <HelpTip id="sale-attach" />
        </div>
        {doc.attachmentIds.map((id) => (
          <div className="toolbar" key={id}>
            <Button
              variant="ghost"
              onClick={() => void window.api.sales.attachment(firmId, id).then(unwrap).catch(error)}
            >
              {t('sales.attachment', { id })}
            </Button>
            <Button
              variant="ghost"
              onClick={() => update({ attachmentIds: doc.attachmentIds.filter((i) => i !== id) })}
            >
              {t('sales.remove')}
            </Button>
          </div>
        ))}
        <h3>
          {t('sales.charges')} <HelpTip id="sale-charges" />
        </h3>
        {doc.charges.map((charge, i) => (
          <div className="charge-row" key={i}>
            <Input
              aria-label={`${t('sales.chargeName')} ${i + 1}`}
              value={charge.name}
              onChange={(e) =>
                update({
                  charges: doc.charges.map((c, j) =>
                    j === i ? { ...c, name: e.target.value } : c,
                  ),
                })
              }
            />
            <MoneyInput
              aria-label={`${t('sales.chargeAmount')} ${i + 1}`}
              value={charge.amount}
              onValueChange={(amount) =>
                update({ charges: doc.charges.map((c, j) => (j === i ? { ...c, amount } : c)) })
              }
            />
            <Input
              aria-label={`${t('sales.taxRate')} ${i + 1}`}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={charge.taxBps / 100}
              onChange={(e) =>
                update({
                  charges: doc.charges.map((c, j) =>
                    j === i ? { ...c, taxBps: Math.round(Number(e.target.value) * 100) } : c,
                  ),
                })
              }
            />
            <Button
              variant="ghost"
              onClick={() => update({ charges: doc.charges.filter((_, j) => j !== i) })}
            >
              {t('sales.remove')}
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            update({
              charges: [...doc.charges, { name: t('sales.shipping'), amount: 0, taxBps: 0 }],
            })
          }
        >
          {t('sales.addCharge')}
        </Button>
      </div>
      <div className="card stack">
        <div className="form-grid">
          <SaleMoney
            name="transactionDiscount"
            value={doc.discount}
            onChange={(discount) => update({ discount, discountBps: 0 })}
          />
          <SaleField name="transactionDiscountPercent">
            <Input
              id="sale-transactionDiscountPercent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={doc.discountBps / 100}
              onChange={(e) =>
                update({ discountBps: Math.round(Number(e.target.value) * 100), discount: 0 })
              }
            />
          </SaleField>
          {settings.roundOff && (
            <>
              <SaleField name="roundMode">
                <Select
                  label={t('sales.roundMode')}
                  value={doc.roundMode}
                  onChange={(roundMode) =>
                    update({ roundMode: roundMode as SaleDocument['roundMode'] })
                  }
                  options={['off', 'nearest', 'up', 'down'].map((value) => ({
                    value,
                    label: t(`sales.${value}`),
                  }))}
                />
              </SaleField>
              <SaleField name="roundStep">
                <Select
                  label={t('sales.roundStep')}
                  value={String(doc.roundStep)}
                  onChange={(v) => update({ roundStep: Number(v) as 100 })}
                  options={[100, 50, 10].map((value) => ({
                    value: String(value),
                    label: t(`sales.step${value}`),
                  }))}
                />
              </SaleField>
            </>
          )}
        </div>
        <div className="sales-totals">
          {['taxable', 'cgst', 'sgst', 'igst', 'cess', 'roundOff', 'total'].map((k) => (
            <div key={k} className={k === 'total' ? 'total' : ''}>
              <span>{t(`sales.${k}`)}</span>
              <MoneyText value={calculated[k as keyof typeof calculated] as number} />
            </div>
          ))}
        </div>
        {posting && (
          <>
            <h3>
              {t(DOCUMENT_CONFIG[doc.type].payments === 'pay' ? 'sales.paidNow' : 'sales.received')}{' '}
              <HelpTip id="sale-payments" />
            </h3>
            {doc.payments.map((payment, i) => (
              <div className="payment-row" key={i}>
                <Select
                  label={`${t('sales.account')} ${i + 1}`}
                  value={String(payment.accountId)}
                  onChange={(v) =>
                    update({
                      payments: doc.payments.map((p, j) =>
                        j === i ? { ...p, accountId: Number(v) } : p,
                      ),
                    })
                  }
                  options={accounts.map((a) => ({
                    value: String(a.id),
                    label:
                      a.type === 'bank'
                        ? a.name
                        : t(`sales.account.${a.type}`, { defaultValue: a.name }),
                  }))}
                />
                <MoneyInput
                  aria-label={`${t('sales.received')} ${i + 1}`}
                  value={payment.amount}
                  onValueChange={(amount) =>
                    update({
                      payments: doc.payments.map((p, j) => (j === i ? { ...p, amount } : p)),
                    })
                  }
                />
                <Input
                  aria-label={`${t('sales.paymentReference')} ${i + 1}`}
                  placeholder={t('sales.paymentReference')}
                  value={payment.reference}
                  onChange={(e) =>
                    update({
                      payments: doc.payments.map((p, j) =>
                        j === i ? { ...p, reference: e.target.value } : p,
                      ),
                    })
                  }
                />
                {accounts.find((a) => a.id === payment.accountId)?.type === 'cheque' && (
                  <Input
                    type="date"
                    aria-label={t('sales.chequeDate')}
                    value={payment.chequeDate || doc.date}
                    onChange={(e) =>
                      update({
                        payments: doc.payments.map((p, j) =>
                          j === i ? { ...p, chequeDate: e.target.value } : p,
                        ),
                      })
                    }
                  />
                )}
                <Button
                  variant="ghost"
                  onClick={() => update({ payments: doc.payments.filter((_, j) => j !== i) })}
                >
                  {t('sales.remove')}
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={!accounts.length}
              onClick={() =>
                update({
                  payments: [
                    ...doc.payments,
                    {
                      accountId: accounts[0].id,
                      amount: Math.max(0, calculated.total - received),
                      reference: '',
                    },
                  ],
                })
              }
            >
              {t('sales.addPayment')}
            </Button>
            <div className="sales-balance">
              <span>{t('sales.balance')}</span>
              <MoneyText value={calculated.total - received} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
