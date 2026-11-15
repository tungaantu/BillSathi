import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adjustmentSchema,
  stockAmount,
  today,
  type Adjustment,
  type Item,
} from '../../../shared/masters';
import { unwrap } from '../../../shared/types';
import { Button, Dialog, useToast } from '../../components/ui';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import {
  AmountField,
  Choice,
  FormErrors,
  QtyField,
  TextField,
  useMasters,
} from '../masters/common';
export function AdjustStock({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useTranslation(),
    toast = useToast(),
    { firmId, lookups, invalidate, error } = useMasters();
  const [value, set] = useState<Adjustment>({
    direction: 'add',
    qty: 1,
    price: item.purchasePrice,
    date: today(),
    reason: '',
    unitId: item.unitId,
  });
  const [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useSaveShortcut(form);
  const update = <K extends keyof Adjustment>(k: K, v: Adjustment[K]) =>
    set((p) => ({ ...p, [k]: v }));
  async function save() {
    if (form.current?.querySelector('[aria-invalid="true"]')) {
      setErrors(['money']);
      return;
    }
    const checked = adjustmentSchema.safeParse(value);
    if (!checked.success) {
      setErrors(checked.error.issues.map((i) => String(i.path[0])));
      return;
    }
    setBusy(true);
    try {
      unwrap(await window.api.masters.adjust(firmId, item.id, checked.data));
      await invalidate();
      toast(t('saved'));
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={t('masters.adjustStock')}
      description={item.name}
    >
      <form
        ref={form}
        className="stack"
        noValidate
        onKeyDown={advanceField}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormErrors fields={errors} />
        <Choice
          name="direction"
          value={value.direction}
          onChange={(v) => update('direction', v as Adjustment['direction'])}
          options={['add', 'reduce'].map((value) => ({ value, label: t(`masters.${value}`) }))}
        />
        <QtyField name="qty" value={value.qty} onChange={(v) => update('qty', v)} />
        <Choice
          name="unitId"
          value={String(value.unitId ?? '')}
          onChange={(v) => {
            const id = v ? Number(v) : null;
            update('unitId', id);
            update(
              'price',
              stockAmount(id === item.secondaryUnitId ? item.conversion : 1, item.purchasePrice),
            );
          }}
          options={[
            ...(item.unitId ? [] : [{ value: '', label: t('masters.baseUnit') }]),
            ...lookups.units
              .filter((u) => u.id === item.unitId || u.id === item.secondaryUnitId)
              .map((u) => ({ value: String(u.id), label: u.symbol })),
          ]}
        />
        <AmountField name="price" value={value.price} onChange={(v) => update('price', v)} />
        <TextField name="date" type="date" value={value.date} onChange={(v) => update('date', v)} />
        <TextField
          name="reason"
          required
          value={value.reason}
          onChange={(v) => update('reason', v)}
        />
        <p className="muted">{t('masters.adjustHelp')}</p>
        <Button type="submit" disabled={busy}>
          {t('save')}
        </Button>
      </form>
    </Dialog>
  );
}
