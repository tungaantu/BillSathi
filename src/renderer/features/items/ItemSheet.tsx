import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { blankItem, itemSchema, type Item, type ItemInput } from '../../../shared/masters';
import { unwrap } from '../../../shared/types';
import { Button, Checkbox, Input, Sheet, Tabs, useToast } from '../../components/ui';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import {
  AmountField,
  Choice,
  CustomFields,
  FormErrors,
  MasterField,
  QtyField,
  TextField,
  useMasters,
} from '../masters/common';
export function ItemSheet({
  item,
  onClose,
  onSaved,
}: {
  item: Item | null;
  onClose: () => void;
  onSaved?: (item: Item) => void;
}) {
  const { t } = useTranslation(),
    toast = useToast();
  const { firmId, settings, lookups, invalidate, error } = useMasters();
  const [value, set] = useState<ItemInput>(item ?? blankItem()),
    [tab, setTab] = useState('pricing'),
    [categoryName, setCategoryName] = useState('');
  const [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const [recordId, setRecordId] = useState<number | null>(item?.id ?? null);
  useSaveShortcut(form);
  const update = <K extends keyof ItemInput>(key: K, v: ItemInput[K]) =>
    set((p) => ({ ...p, [key]: v }));
  const opts = (names: string[]) => names.map((value) => ({ value, label: t(`masters.${value}`) }));
  async function save(next = false) {
    if (form.current?.querySelector('[aria-invalid="true"]')) {
      setErrors(['money']);
      return;
    }
    const parsed = itemSchema.safeParse(value);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => String(i.path[0])));
      return;
    }
    setBusy(true);
    try {
      const saved = unwrap(await window.api.masters.saveItem(firmId, recordId, parsed.data));
      onSaved?.(saved);
      await invalidate();
      toast(t('saved'));
      if (next) {
        setRecordId(null);
        set(blankItem());
        setErrors([]);
        setTab('pricing');
        requestAnimationFrame(() =>
          form.current?.querySelector<HTMLInputElement>('input')?.focus(),
        );
      } else onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function addCategory() {
    try {
      const row = unwrap(
        await window.api.masters.saveLookup(firmId, 'categories', null, categoryName),
      );
      update('categoryId', row.id);
      setCategoryName('');
      await invalidate();
      toast(t('saved'));
    } catch (e) {
      error(e);
    }
  }
  async function image(file?: File) {
    if (!file) return;
    if (file.size > 2e6 || !['image/png', 'image/jpeg'].includes(file.type)) {
      error(new Error('validation'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update('image', String(reader.result));
    reader.onerror = () => error(new Error('storage'));
    reader.readAsDataURL(file);
  }
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={t(recordId ? 'masters.editItem' : 'masters.newItem')}
    >
      <form
        ref={form}
        className="stack master-form"
        onKeyDown={advanceField}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormErrors fields={errors} />
        <Choice
          name="type"
          value={value.type}
          options={opts(['product', 'service'])}
          onChange={(v) => {
            update('type', v as ItemInput['type']);
            if (v === 'service') {
              update('openingQty', 0);
              setTab('pricing');
            }
          }}
        />
        <TextField name="name" required value={value.name} onChange={(v) => update('name', v)} />
        <div className="form-grid">
          <div className="stack">
            <TextField name="code" value={value.code} onChange={(v) => update('code', v)} />
            <Button
              variant="secondary"
              onClick={() =>
                void window.api.masters
                  .code(firmId)
                  .then(unwrap)
                  .then((v) => update('code', v))
                  .catch(error)
              }
            >
              {t('masters.assignCode')}
            </Button>
          </div>
          <TextField name="hsn" value={value.hsn} onChange={(v) => update('hsn', v)} />
          <Choice
            name="categoryId"
            value={String(value.categoryId ?? '')}
            options={[
              { value: '', label: t('masters.none') },
              ...lookups.categories.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
            onChange={(v) => update('categoryId', v ? Number(v) : null)}
          />
          <div className="inline-create">
            <TextField name="newCategory" value={categoryName} onChange={setCategoryName} />
            <Button
              variant="secondary"
              disabled={!categoryName.trim()}
              onClick={() => void addCategory()}
            >
              {t('masters.create')}
            </Button>
          </div>
          <Choice
            name="unitId"
            value={String(value.unitId ?? '')}
            options={[
              { value: '', label: t('masters.none') },
              ...lookups.units.map((u) => ({ value: String(u.id), label: u.symbol })),
            ]}
            onChange={(v) => update('unitId', v ? Number(v) : null)}
          />
          <Choice
            name="secondaryUnitId"
            value={String(value.secondaryUnitId ?? '')}
            options={[
              { value: '', label: t('masters.none') },
              ...lookups.units
                .filter((u) => u.id !== value.unitId)
                .map((u) => ({ value: String(u.id), label: u.symbol })),
            ]}
            onChange={(v) => {
              update('secondaryUnitId', v ? Number(v) : null);
              const c = lookups.conversions.find(
                (c) => c.fromUnit === Number(v) && c.toUnit === value.unitId,
              );
              if (c) update('conversion', c.factor);
            }}
          />
          {value.secondaryUnitId && (
            <>
              <QtyField
                name="conversion"
                value={value.conversion}
                onChange={(v) => update('conversion', v)}
              />
              <p className="muted conversion-preview">
                {t('masters.conversionPreview', {
                  secondary: lookups.units.find((u) => u.id === value.secondaryUnitId)?.symbol,
                  factor: value.conversion,
                  base: lookups.units.find((u) => u.id === value.unitId)?.symbol,
                })}
              </p>
            </>
          )}
        </div>
        <MasterField name="image">
          <Input
            id="master-image"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => void image(e.target.files?.[0])}
          />
          {value.image && (
            <div className="button-row">
              <img className="item-image" src={value.image} alt={value.name} />
              <Button variant="ghost" onClick={() => update('image', null)}>
                {t('masters.removeImage')}
              </Button>
            </div>
          )}
        </MasterField>
        <Tabs
          value={tab}
          onValueChange={setTab}
          tabs={[
            'pricing',
            ...(value.type === 'product' && settings.stock ? ['stock'] : []),
            'more',
          ].map((value) => ({ value, label: t(`masters.${value}`) }))}
        />
        <div hidden={tab !== 'pricing'}>
          <div className="form-grid">
            <AmountField
              name="salePrice"
              value={value.salePrice}
              onChange={(v) => update('salePrice', v)}
            />
            <Choice
              name="saleTaxMode"
              value={value.inclusive ? 'withTax' : 'withoutTax'}
              options={opts(['withTax', 'withoutTax'])}
              onChange={(v) => update('inclusive', v === 'withTax')}
            />
            {Boolean(settings.itemDiscount) && (
              <>
                <Choice
                  name="discountType"
                  value={value.discountType}
                  options={opts(['percent', 'amount'])}
                  onChange={(v) => update('discountType', v as ItemInput['discountType'])}
                />
                {value.discountType === 'amount' ? (
                  <AmountField
                    name="discountAmount"
                    value={value.discountAmount}
                    onChange={(v) => update('discountAmount', v)}
                  />
                ) : (
                  <MasterField name="discountBps">
                    <Input
                      id="master-discountBps"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={value.discountBps / 100}
                      onChange={(e) =>
                        update('discountBps', Math.round(Number(e.target.value) * 100))
                      }
                    />
                  </MasterField>
                )}
              </>
            )}
            {Boolean(settings.wholesale) && (
              <>
                <AmountField
                  name="wholesalePrice"
                  value={value.wholesalePrice}
                  onChange={(v) => update('wholesalePrice', v)}
                />
                <QtyField
                  name="wholesaleQty"
                  value={value.wholesaleQty}
                  onChange={(v) => update('wholesaleQty', v)}
                />
              </>
            )}
            <AmountField
              name="purchasePrice"
              value={value.purchasePrice}
              onChange={(v) => update('purchasePrice', v)}
            />
            <Choice
              name="purchaseTaxMode"
              value={value.purchaseInclusive ? 'withTax' : 'withoutTax'}
              options={opts(['withTax', 'withoutTax'])}
              onChange={(v) => update('purchaseInclusive', v === 'withTax')}
            />
            {Boolean(settings.mrp) && (
              <AmountField name="mrp" value={value.mrp} onChange={(v) => update('mrp', v)} />
            )}
            {Boolean(settings.itemTax) && (
              <Choice
                name="taxRateId"
                value={String(value.taxRateId ?? '')}
                options={[
                  { value: '', label: t('masters.none') },
                  ...lookups.taxes.map((r) => ({ value: String(r.id), label: r.name })),
                ]}
                onChange={(v) => update('taxRateId', v ? Number(v) : null)}
              />
            )}
          </div>
        </div>
        <div hidden={tab !== 'stock' || value.type === 'service'}>
          <div className="form-grid">
            <QtyField
              name="openingQty"
              value={value.openingQty}
              onChange={(v) => update('openingQty', v)}
            />
            <AmountField
              name="openingPrice"
              value={value.openingPrice}
              onChange={(v) => update('openingPrice', v)}
            />
            <TextField
              name="openingDate"
              type="date"
              value={value.openingDate}
              onChange={(v) => update('openingDate', v)}
            />
            <QtyField
              name="minStock"
              value={value.minStock}
              onChange={(v) => update('minStock', v)}
            />
            <TextField
              name="location"
              value={value.location}
              onChange={(v) => update('location', v)}
            />
            {Boolean(settings.batches) && (
              <MasterField name="trackBatches">
                <Checkbox
                  label={t('masters.trackBatchesHint')}
                  checked={value.trackBatches}
                  onCheckedChange={(v) => update('trackBatches', v)}
                />
              </MasterField>
            )}
            {Boolean(settings.serials) && (
              <MasterField name="trackSerials">
                <Checkbox
                  label={t('masters.trackSerialsHint')}
                  checked={value.trackSerials}
                  onCheckedChange={(v) => update('trackSerials', v)}
                />
              </MasterField>
            )}
          </div>
        </div>
        <div hidden={tab !== 'more'}>
          <MasterField name="serviceReminderDays">
            <Input
              id="master-serviceReminderDays"
              type="number"
              min="0"
              max="36500"
              step="1"
              value={value.serviceReminderDays}
              onChange={(e) => update('serviceReminderDays', Number(e.target.value))}
            />
          </MasterField>
          <CustomFields
            kind="item"
            values={value.customFields}
            onChange={(v) => update('customFields', v)}
          />
        </div>
        <div className="form-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          {
            <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>
              {t('masters.saveNew')}
            </Button>
          }
          <Button type="submit" disabled={busy}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
