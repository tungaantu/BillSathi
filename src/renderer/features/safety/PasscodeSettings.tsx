import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '../../../shared/types';
import type { LockOptions } from '../../../shared/safety-api';
import {
  Button,
  Dialog,
  Field,
  HelpTip,
  Input,
  Select,
  Switch,
  useToast,
} from '../../components/ui';
import { useApp } from '../../app/state';
import { PinDialog } from './LockGate';
import { RecoveryCode } from './RecoveryCode';
import { lockNow, refreshLockStatus } from './lock';

const MINUTES = [0, 1, 5, 15, 30] as const;
type Mode = 'set' | 'change';

function PinForm({
  mode,
  onClose,
  onSaved,
}: {
  mode: Mode;
  onClose: () => void;
  onSaved: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(''),
    [pin, setPin] = useState(''),
    [again, setAgain] = useState(''),
    [error, setError] = useState('');
  async function submit() {
    if (!/^\d{4,6}$/.test(pin)) return setError(t('safety.lock.pinRule'));
    if (pin !== again) return setError(t('safety.lock.mismatch'));
    const result = unwrap(
      await window.api.safety.lock.setPin(pin, mode === 'change' ? current : undefined),
    );
    if (!result.ok)
      return setError(result.cooldownMs ? t('safety.lock.tooMany') : t('safety.lock.wrongShort'));
    onSaved(result.recoveryCode ?? '');
  }
  const digits = (set: (v: string) => void) => (e: { target: { value: string } }) =>
    set(e.target.value.replace(/\D/g, '').slice(0, 6));
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {mode === 'change' && (
        <Field id="pin-current" label={t('safety.lock.currentPin')}>
          <Input
            id="pin-current"
            autoFocus
            type="password"
            inputMode="numeric"
            value={current}
            onChange={digits(setCurrent)}
          />
        </Field>
      )}
      <Field id="pin-new" label={t('safety.lock.newPin')} help="safetyPin">
        <Input
          id="pin-new"
          autoFocus={mode === 'set'}
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={digits(setPin)}
        />
      </Field>
      <Field id="pin-again" label={t('safety.lock.confirmPin')} error={error}>
        <Input
          id="pin-again"
          type="password"
          inputMode="numeric"
          value={again}
          onChange={digits(setAgain)}
        />
      </Field>
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={!pin || !again}>
          {t('safety.lock.savePin')}
        </Button>
      </div>
    </form>
  );
}

/** Settings → General: PIN, idle lock and "ask PIN before editing or deleting". */
export function PasscodeSettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const { error } = useApp();
  const status = useQuery({
    queryKey: ['lock-status'],
    queryFn: async () => unwrap(await window.api.safety.lock.status()),
  });
  const [form, setForm] = useState<Mode | null>(null),
    [code, setCode] = useState<string | null>(null),
    [ask, setAsk] = useState<{ title: string; run: (pin: string) => Promise<boolean> } | null>(
      null,
    );
  const data = status.data;
  const reload = async () => {
    await refreshLockStatus();
    await client.invalidateQueries({ queryKey: ['lock-status'] });
  };
  /** Weakening the lock needs the current PIN; strengthening does not. */
  async function setOptions(options: LockOptions, weaker: boolean) {
    const run = async (pin?: string) => {
      try {
        const result = unwrap(await window.api.safety.lock.setOptions(options, pin));
        if (result.ok) {
          await reload();
          toast(t('saved'));
        }
        return result.ok;
      } catch (e) {
        error(e);
        return false;
      }
    };
    if (weaker) setAsk({ title: t('safety.lock.promptTitle'), run });
    else await run();
  }
  if (!data) return null;
  return (
    <section className="card settings-card" data-tour="safety-lock">
      <h3>{t('safety.lock.settingsTitle')}</h3>
      <div className="setting-row">
        <div className="field-label">
          <span>{data.hasPin ? t('safety.lock.on') : t('safety.lock.off')}</span>
          <HelpTip id="safetyLock" />
        </div>
        <div className="button-row">
          {data.hasPin ? (
            <>
              <Button variant="secondary" onClick={lockNow}>
                {t('safety.lock.lockNow')}
              </Button>
              <Button variant="secondary" onClick={() => setForm('change')}>
                {t('safety.lock.change')}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setAsk({
                    title: t('safety.lock.removeTitle'),
                    run: async (pin) => {
                      const ok = unwrap(await window.api.safety.lock.removePin(pin)).ok;
                      if (ok) {
                        await reload();
                        toast(t('safety.lock.removed'));
                      }
                      return ok;
                    },
                  })
                }
              >
                {t('safety.lock.remove')}
              </Button>
            </>
          ) : (
            <Button onClick={() => setForm('set')}>{t('safety.lock.set')}</Button>
          )}
        </div>
      </div>
      {data.hasPin && (
        <>
          <div className="setting-row">
            <div className="field-label">
              <span>{t('safety.lock.after')}</span>
              <HelpTip id="safetyLockAfter" />
            </div>
            <div className="setting-control">
              <Select
                label={t('safety.lock.after')}
                value={String(data.lockAfterMinutes)}
                options={MINUTES.map((m) => ({
                  value: String(m),
                  label: m ? t('safety.lock.minutes', { count: m }) : t('safety.lock.never'),
                }))}
                onChange={(v) =>
                  void setOptions(
                    { lockAfterMinutes: Number(v) as (typeof MINUTES)[number] },
                    Number(v) === 0 && data.lockAfterMinutes !== 0,
                  )
                }
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="field-label">
              <span>{t('safety.lock.askEdit')}</span>
              <HelpTip id="safetyAskEdit" />
            </div>
            <Switch
              label={t('safety.lock.askEdit')}
              checked={data.askPinForEdit}
              onCheckedChange={(v) => void setOptions({ askPinForEdit: v }, !v)}
            />
          </div>
        </>
      )}
      <Dialog
        open={form !== null}
        onOpenChange={(v) => !v && setForm(null)}
        title={t(form === 'change' ? 'safety.lock.change' : 'safety.lock.set')}
        description={t('safety.lock.setBody')}
      >
        {form && (
          <PinForm
            mode={form}
            onClose={() => setForm(null)}
            onSaved={(recovery) => {
              setForm(null);
              setCode(recovery);
              void reload();
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={code !== null}
        onOpenChange={(v) => !v && setCode(null)}
        title={t('safety.lock.recoveryTitle')}
      >
        {code && <RecoveryCode code={code} onDone={() => setCode(null)} />}
      </Dialog>
      <PinDialog
        open={ask !== null}
        title={ask?.title ?? ''}
        onClose={() => setAsk(null)}
        onSubmit={(pin) => (ask ? ask.run(pin) : Promise.resolve(false))}
      />
    </section>
  );
}
