import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Leaf } from 'lucide-react';
import { APP_NAME } from '../../../shared/constants';
import { unwrap } from '../../../shared/types';
import { Button, Dialog, Field, Input } from '../../components/ui';
import { PinEntry } from './PinEntry';
import { lockNow, refreshLockStatus, useLock } from './lock';
import { RecoveryCode } from './RecoveryCode';

/** Checks a PIN with the main process and turns the answer into a message and cooldown. */
export function usePinVerifier() {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string>();
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const verify = useCallback(
    async (pin: string) => {
      const result = unwrap(await window.api.safety.lock.verify(pin));
      if (result.ok) return true;
      if (result.cooldownMs > 0) setCooldownUntil(Date.now() + result.cooldownMs);
      setMessage(
        result.cooldownMs > 0
          ? t('safety.lock.tooMany')
          : t('safety.lock.wrong', { count: result.attemptsLeft }),
      );
      return false;
    },
    [t],
  );
  return { verify, message, cooldownUntil };
}

function LockScreen() {
  const { t } = useTranslation();
  const { verify, message, cooldownUntil } = usePinVerifier();
  const [recover, setRecover] = useState(false);
  return (
    <div
      className="lock-screen"
      role="dialog"
      aria-modal="true"
      aria-label={t('safety.lock.title', { app: APP_NAME })}
    >
      <div className="lock-card">
        <span className="brand-symbol">
          <Leaf size={26} />
        </span>
        <h1>{t('safety.lock.title', { app: APP_NAME })}</h1>
        {recover ? (
          <RecoverForm
            onBack={() => setRecover(false)}
            onDone={() => useLock.setState({ locked: false })}
          />
        ) : (
          <>
            <p className="muted">{t('safety.lock.body')}</p>
            <PinEntry
              cooldownUntil={cooldownUntil}
              message={message}
              onSubmit={async (pin) => {
                const ok = await verify(pin);
                if (ok) useLock.setState({ locked: false });
                return ok;
              }}
            />
            <Button variant="ghost" onClick={() => setRecover(true)}>
              {t('safety.lock.forgot')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function RecoverForm({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState(''),
    [pin, setPin] = useState(''),
    [again, setAgain] = useState(''),
    [error, setError] = useState(''),
    [fresh, setFresh] = useState<string | null>(null);
  async function submit() {
    if (!/^\d{4,6}$/.test(pin)) return setError(t('safety.lock.pinRule'));
    if (pin !== again) return setError(t('safety.lock.mismatch'));
    const result = unwrap(await window.api.safety.lock.recover(code, pin));
    if (!result.ok) return setError(t('safety.lock.badCode'));
    await refreshLockStatus();
    setFresh(result.recoveryCode ?? null);
  }
  if (fresh) return <RecoveryCode code={fresh} onDone={onDone} />;
  return (
    <form
      className="stack lock-recover"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="muted">{t('safety.lock.recoverBody')}</p>
      <Field id="rc-code" label={t('safety.lock.recoveryCode')} help="safetyRecovery">
        <Input
          id="rc-code"
          autoFocus
          value={code}
          placeholder="XXXX-XXXX-XXXX"
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <Field id="rc-pin" label={t('safety.lock.newPin')} help="safetyPin">
        <Input
          id="rc-pin"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
      </Field>
      <Field id="rc-again" label={t('safety.lock.confirmPin')} error={error}>
        <Input
          id="rc-again"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
      </Field>
      <div className="form-actions">
        <Button variant="secondary" onClick={onBack}>
          {t('back')}
        </Button>
        <Button type="submit" disabled={!code || !pin}>
          {t('safety.lock.resetPin')}
        </Button>
      </div>
    </form>
  );
}

function PinPrompt({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (pin: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string>();
  const [cooldownUntil, setCooldownUntil] = useState(0);
  return (
    <PinEntry
      cooldownUntil={cooldownUntil}
      message={message}
      onSubmit={async (pin) => {
        const ok = await onSubmit(pin);
        if (ok) {
          onClose();
          return true;
        }
        const status = unwrap(await window.api.safety.lock.status());
        if (status.cooldownMs > 0) setCooldownUntil(Date.now() + status.cooldownMs);
        setMessage(status.cooldownMs > 0 ? t('safety.lock.tooMany') : t('safety.lock.wrongShort'));
        return false;
      }}
    />
  );
}

/** Asks for the PIN before an edit or delete (see requirePin). */
export function PinDialog({
  open,
  title,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Return true to accept and close. */
  onSubmit: (pin: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={title}
      description={t('safety.lock.promptBody')}
      className="pin-dialog"
    >
      <PinPrompt onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function PendingPin() {
  const { t } = useTranslation();
  const pending = useLock((s) => s.pending);
  return (
    <PinDialog
      open={Boolean(pending)}
      title={t('safety.lock.promptTitle')}
      onClose={() => useLock.setState({ pending: null })}
      onSubmit={async (pin) => {
        const ok = unwrap(await window.api.safety.lock.verify(pin)).ok;
        if (ok) {
          const action = useLock.getState().pending;
          useLock.setState({ pending: null });
          action?.();
        }
        return ok;
      }}
    />
  );
}

/** Wraps the whole app: lock screen at start and after idle time, Ctrl+L to lock at once. */
export function LockGate({ children }: { children: ReactNode }) {
  const { locked, status } = useLock();
  useEffect(() => {
    void refreshLockStatus(true).catch(() =>
      useLock.setState({
        status: { hasPin: false, lockAfterMinutes: 0, askPinForEdit: false, cooldownMs: 0 },
      }),
    );
  }, []);
  const minutes = status?.hasPin ? status.lockAfterMinutes : 0;
  useEffect(() => {
    if (!minutes || locked) return;
    let timer = setTimeout(lockNow, minutes * 60_000);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lockNow, minutes * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'mousemove'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, locked]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l' && !e.shiftKey) {
        e.preventDefault();
        lockNow();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  if (!status) return null;
  return (
    <>
      <div style={{ display: locked ? 'none' : 'contents' }} aria-hidden={locked}>
        {children}
      </div>
      {locked && <LockScreen />}
      {!locked && <PendingPin />}
    </>
  );
}
