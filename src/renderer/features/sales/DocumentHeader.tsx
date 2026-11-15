import { useCustomerRates } from '../customers/common';
import { customerLine } from '../../../shared/customer-features';
import { Checkbox } from '../../components/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Select, Input, MoneyText } from '../../components/ui';
import { PartySheet } from '../parties/PartySheet';
import { SaleField, SaleText, useSales } from './common';
import { useGodowns } from '../inventory/common';
import { DOCUMENT_CONFIG } from '../../../shared/sales';
import { dueAfter, type SaleDocument } from '../../../shared/sales';
import type { Party } from '../../../shared/masters';
import { STATES } from '../../../shared/constants';
export function DocumentHeader({
  doc,
  update,
  duplicate,
}: {
  doc: SaleDocument;
  update: (patch: Partial<SaleDocument>) => void;
  duplicate: boolean;
}) {
  const { t, i18n } = useTranslation(),
    { parties, settings, firm, items } = useSales(),
    godowns = useGodowns();
  const [adding, setAdding] = useState(false);
  const rates = useCustomerRates();
  const reprice = (partyId: number | null) =>
    doc.lines.map((line) => {
      const item = items.find((i) => i.id === line.itemId);
      return item
        ? {
            ...line,
            ...customerLine(
              { ...doc, partyId },
              item,
              line.taxBps,
              rates.data ?? [],
              settings,
              line.qty,
              line.unitId,
            ),
            freeQty: line.freeQty,
          }
        : line;
    });
  const selected = parties.find((p) => p.id === doc.partyId);
  const choose = (p: Party) =>
    update({
      partyId: p.id,
      lines: reprice(p.id),
      loyaltyRedeem: 0,
      loyaltyDiscount: 0,
      partyName: p.name,
      phone: p.phone,
      billingAddress: p.billingAddress,
      shippingAddress: p.shippingAddress,
      placeOfSupply: p.stateCode || firm!.stateCode,
    });
  return (
    <section className="card sales-header form-grid" data-tour="sales-work">
      <SaleField name="saleMode">
        <Select
          label={t('sales.saleMode')}
          value={doc.cash ? 'cash' : 'credit'}
          onChange={(v) => update({ cash: v === 'cash' })}
          options={['credit', 'cash'].map((value) => ({ value, label: t(`sales.${value}`) }))}
        />
      </SaleField>
      <SaleField name="party">
        <Select
          label={t('sales.party')}
          value={String(doc.partyId ?? '')}
          options={[
            { value: '', label: t('sales.walkIn') },
            ...parties
              .filter((p) => p.active)
              .map((p) => ({ value: String(p.id), label: `${p.name} · ${p.phone}` })),
            { value: 'add', label: t('masters.newParty') },
          ]}
          onChange={(v) => {
            if (v === 'add') setAdding(true);
            else if (v) choose(parties.find((p) => p.id === Number(v))!);
            else
              update({
                partyId: null,
                lines: reprice(null),
                loyaltyRedeem: 0,
                loyaltyDiscount: 0,
                partyName: '',
                phone: '',
                billingAddress: '',
                shippingAddress: '',
                placeOfSupply: firm!.stateCode,
              });
          }}
        />
        {selected && (
          <p className="muted">
            {t('sales.partyBalance')}: <MoneyText value={selected.balance} />
          </p>
        )}
      </SaleField>
      {doc.cash && !doc.partyId && (
        <SaleText
          name="partyName"
          value={doc.partyName}
          onChange={(partyName) => update({ partyName })}
        />
      )}
      {doc.type === 'purchase' && (
        <>
          <SaleText
            name="supplierBillNo"
            value={doc.supplierBillNo ?? ''}
            onChange={(supplierBillNo) => update({ supplierBillNo })}
          />
          <SaleText
            name="supplierBillDate"
            type="date"
            value={doc.supplierBillDate ?? ''}
            onChange={(supplierBillDate) => update({ supplierBillDate })}
          />
        </>
      )}
      {['purchase', 'purchase_return', 'expense'].includes(doc.type) && (
        <SaleField name="itcEligible">
          <Checkbox
            label={t('sales.itcEligible')}
            checked={doc.itcEligible ?? true}
            onCheckedChange={(itcEligible) => update({ itcEligible })}
          />
        </SaleField>
      )}
      <SaleText name="phone" value={doc.phone} onChange={(phone) => update({ phone })} />
      <SaleText name="prefix" value={doc.prefix} onChange={(prefix) => update({ prefix })} />
      <SaleField name="number">
        <Input
          id="sale-number"
          type="number"
          min="1"
          value={doc.number}
          onChange={(e) => update({ number: Number(e.target.value) })}
        />
        {duplicate && (
          <p className="field-error" role="alert">
            {t('sales.error.duplicate')}
          </p>
        )}
      </SaleField>
      <SaleText
        name="date"
        type="date"
        value={doc.date}
        onChange={(date) =>
          update({
            date,
            ...(doc.paymentTerms ? { dueDate: dueAfter(date, doc.paymentTerms) } : {}),
          })
        }
      />
      {settings.dueDates && (
        <>
          <SaleField name="paymentTerms">
            <Input
              id="sale-paymentTerms"
              type="number"
              min="0"
              max="3650"
              value={doc.paymentTerms}
              onChange={(e) => {
                const paymentTerms = Number(e.target.value);
                update({ paymentTerms, dueDate: dueAfter(doc.date, paymentTerms) });
              }}
            />
          </SaleField>
          <SaleText
            name="dueDate"
            type="date"
            value={doc.dueDate}
            onChange={(dueDate) => update({ dueDate })}
          />
        </>
      )}
      {Boolean(settings.godowns) && DOCUMENT_CONFIG[doc.type].stockSign !== 0 && (
        <SaleField name="godown">
          <Select
            label={t('sales.godown')}
            value={String(doc.godownId ?? godowns.data?.find((g) => g.main)?.id ?? '')}
            onChange={(v) => update({ godownId: Number(v) || null })}
            options={(godowns.data ?? []).map((g) => ({ value: String(g.id), label: g.name }))}
          />
        </SaleField>
      )}
      <SaleField name="placeOfSupply">
        <Select
          label={t('sales.placeOfSupply')}
          value={doc.placeOfSupply}
          onChange={(placeOfSupply) => update({ placeOfSupply })}
          options={STATES.map((s) => ({
            value: s.code,
            label: `${s.code} · ${i18n.language === 'hi' ? s.hi : s.en}`,
          }))}
        />
      </SaleField>
      <SaleText
        name="billingAddress"
        value={doc.billingAddress}
        onChange={(billingAddress) => update({ billingAddress })}
      />
      {settings.shippingAddress && (
        <SaleText
          name="shippingAddress"
          value={doc.shippingAddress}
          onChange={(shippingAddress) => update({ shippingAddress })}
        />
      )}
      {['sale_return', 'purchase_return'].includes(doc.type) && (
        <SaleField name="reference">
          <Input id="sale-reference" readOnly value={doc.refTxnId ?? ''} />
        </SaleField>
      )}
      <Button variant="ghost" onClick={() => setAdding(true)}>
        {t('masters.newParty')}
      </Button>
      {adding && <PartySheet party={null} onClose={() => setAdding(false)} onSaved={choose} />}
    </section>
  );
}
