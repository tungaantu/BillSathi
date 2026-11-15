import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { blankParty, partySchema, type Party, type PartyInput } from '../../../shared/masters';
import { extractGSTIN, formatGSTIN } from '../../../shared/gstin';
import { STATES } from '../../../shared/constants';
import { unwrap } from '../../../shared/types';
import { Button, Checkbox, Sheet, Tabs, useToast } from '../../components/ui';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import {
  AmountField,
  Choice,
  CustomFields,
  FormErrors,
  TextField,
  useMasters,
} from '../masters/common';
export function PartySheet({
  party,
  onClose,
  onSaved,
}: {
  party: Party | null;
  onClose: () => void;
  onSaved?: (party: Party) => void;
}) {
  const { t, i18n } = useTranslation(),
    toast = useToast();
  const { firm, firmId, settings, lookups, invalidate, error } = useMasters();
  const [value, set] = useState<PartyInput>(party ?? blankParty(firm!.stateCode));
  const [recordId, setRecordId] = useState<number | null>(party?.id ?? null);
  const [tab, setTab] = useState('basic'),
    [errors, setErrors] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const [balanceDirection, setBalanceDirection] = useState(
    party && party.openingBalance < 0 ? 'pay' : 'receive',
  );
  const [same, setSame] = useState(!party || party.shippingAddress === party.billingAddress),
    [groupName, setGroupName] = useState('');
  const form = useRef<HTMLFormElement>(null);
  useSaveShortcut(form);
  const update = <K extends keyof PartyInput>(key: K, v: PartyInput[K]) =>
    set((p) => ({ ...p, [key]: v }));
  async function save(next = false) {
    if (form.current?.querySelector('[aria-invalid="true"]')) {
      setErrors(['money']);
      return;
    }
    const parsed = partySchema.safeParse({
      ...value,
      shippingAddress: same ? value.billingAddress : value.shippingAddress,
    });
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => String(i.path[0])));
      return;
    }
    setBusy(true);
    try {
      const saved = unwrap(await window.api.masters.saveParty(firmId, recordId, parsed.data));
      onSaved?.(saved);
      await invalidate();
      toast(t('saved'));
      if (next) {
        setRecordId(null);
        set(blankParty(firm!.stateCode));
        setTab('basic');
        setErrors([]);
        setSame(true);
        setBalanceDirection('receive');
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
  async function addGroup() {
    try {
      const row = unwrap(await window.api.masters.saveLookup(firmId, 'groups', null, groupName));
      update('groupId', row.id);
      setGroupName('');
      await invalidate();
      toast(t('saved'));
    } catch (e) {
      error(e);
    }
  }
  const opts = (names: string[]) => names.map((value) => ({ value, label: t(`masters.${value}`) }));
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={t(recordId ? 'masters.editParty' : 'masters.newParty')}
    >
      <form
        ref={form}
        onKeyDown={advanceField}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="stack master-form"
        noValidate
      >
        <Tabs
          value={tab}
          onValueChange={setTab}
          tabs={['basic', 'address', 'credit', 'more'].map((value) => ({
            value,
            label: t(`masters.${value}`),
          }))}
        />
        <FormErrors fields={errors} />
        <div hidden={tab !== 'basic'}>
          <div className="form-grid">
            <TextField
              name="name"
              required
              value={value.name}
              onChange={(v) => update('name', v)}
            />
            <TextField name="phone" value={value.phone} onChange={(v) => update('phone', v)} />
            <TextField
              name="email"
              type="email"
              value={value.email}
              onChange={(v) => update('email', v)}
            />
            <Choice
              name="gstType"
              value={value.gstType}
              options={opts(['consumer', 'regular', 'composition'])}
              onChange={(v) => update('gstType', v as PartyInput['gstType'])}
            />
            <TextField
              name="gstin"
              value={value.gstin}
              onChange={(v) => {
                const gstin = formatGSTIN(v),
                  extracted = extractGSTIN(gstin);
                set((p) => ({ ...p, gstin, stateCode: extracted?.stateCode ?? p.stateCode }));
              }}
            />
            <Choice
              name="stateCode"
              value={value.stateCode}
              options={STATES.map((s) => ({
                value: s.code,
                label: i18n.language === 'hi' ? s.hi : s.en,
              }))}
              onChange={(v) => update('stateCode', v)}
            />
          </div>
        </div>
        <div hidden={tab !== 'address'} className="stack">
          <TextField
            name="billingAddress"
            value={value.billingAddress}
            onChange={(v) => update('billingAddress', v)}
          />
          {Boolean(settings.shippingAddress) && (
            <>
              <Checkbox
                label={t('masters.sameAsBilling')}
                checked={same}
                onCheckedChange={setSame}
              />
              {!same && (
                <TextField
                  name="shippingAddress"
                  value={value.shippingAddress}
                  onChange={(v) => update('shippingAddress', v)}
                />
              )}
            </>
          )}
        </div>
        <div hidden={tab !== 'credit'}>
          <div className="form-grid">
            <AmountField
              name="openingBalance"
              value={Math.abs(value.openingBalance)}
              onChange={(v) =>
                update('openingBalance', Math.abs(v) * (balanceDirection === 'pay' ? -1 : 1))
              }
            />
            <Choice
              name="balanceDirection"
              value={balanceDirection}
              options={opts(['receive', 'pay'])}
              onChange={(v) => {
                setBalanceDirection(v);
                update('openingBalance', Math.abs(value.openingBalance) * (v === 'pay' ? -1 : 1));
              }}
            />
            <TextField
              name="openingDate"
              type="date"
              value={value.openingDate}
              onChange={(v) => update('openingDate', v)}
            />
            <Choice
              name="creditLimitMode"
              value={value.creditLimit === null ? 'none' : 'custom'}
              options={opts(['none', 'custom'])}
              onChange={(v) => update('creditLimit', v === 'none' ? null : 0)}
            />
            {value.creditLimit !== null && (
              <AmountField
                name="creditLimit"
                value={value.creditLimit}
                onChange={(v) => update('creditLimit', v)}
              />
            )}
          </div>
        </div>
        <div hidden={tab !== 'more'} className="stack">
          {Boolean(settings.partyGroups) && (
            <>
              <Choice
                name="groupId"
                value={String(value.groupId ?? '')}
                options={[
                  { value: '', label: t('masters.none') },
                  ...lookups.groups.map((g) => ({ value: String(g.id), label: g.name })),
                ]}
                onChange={(v) => update('groupId', v ? Number(v) : null)}
              />
              <div className="inline-create">
                <TextField name="newGroup" value={groupName} onChange={setGroupName} />
                <Button
                  variant="secondary"
                  disabled={!groupName.trim()}
                  onClick={() => void addGroup()}
                >
                  {t('masters.create')}
                </Button>
              </div>
            </>
          )}
          {Boolean(settings.partyStatus) && (
            <Checkbox
              label={t('masters.active')}
              checked={value.active}
              onCheckedChange={(v) => update('active', v)}
            />
          )}
          <CustomFields
            kind="party"
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
