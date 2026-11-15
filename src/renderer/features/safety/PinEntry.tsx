import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete, Check } from 'lucide-react';
import { useCountdown } from './lock';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
/** Numeric keypad that also accepts the keyboard: digits, Backspace and Enter. */
export function PinEntry({
  onSubmit,
  cooldownUntil,
  message,
}: {
  /** Resolve true when accepted; false clears the dots so the owner can try again. */
  onSubmit: (pin: string) => Promise<boolean>;
  cooldownUntil: number;
  message?: string;
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState(''),
    [busy, setBusy] = useState(false),
    [shake, setShake] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seconds = useCountdown(cooldownUntil);
  const blocked = busy || seconds > 0;
  useEffect(() => box.current?.focus(), []);
  async function submit() {
    if (blocked || pin.length < 4) return;
    setBusy(true);
    const accepted = await onSubmit(pin).catch(() => false);
    setBusy(false);
    if (!accepted) {
      setPin('');
      setShake(true);
      setTimeout(() => setShake(false), 400);
      box.current?.focus();
    }
  }
  const press = (digit: string) => !blocked && setPin((p) => (p.length < 6 ? p + digit : p));
  function onKey(event: KeyboardEvent) {
    if (/^\d$/.test(event.key)) press(event.key);
    else if (event.key === 'Backspace') setPin((p) => p.slice(0, -1));
    else if (event.key === 'Enter') void submit();
    else return;
    event.preventDefault();
  }
  return (
    <div
      className="pin-entry"
      ref={box}
      tabIndex={0}
      role="group"
      aria-label={t('safety.lock.pinPad')}
      onKeyDown={onKey}
      onClick={() => box.current?.focus()}
    >
      <div className={`pin-dots ${shake ? 'shake' : ''}`} aria-live="polite">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={i < pin.length ? 'filled' : ''} />
        ))}
        <span className="sr-only">{t('safety.lock.digitsEntered', { count: pin.length })}</span>
      </div>
      <p className={`pin-message ${seconds > 0 ? 'danger' : 'muted'}`} role="alert">
        {seconds > 0 ? t('safety.lock.cooldown', { seconds }) : (message ?? t('safety.lock.hint'))}
      </p>
      <div className="pin-pad">
        {KEYS.map((k) => (
          <button type="button" key={k} disabled={blocked} onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button
          type="button"
          aria-label={t('safety.lock.backspace')}
          disabled={busy || !pin}
          onClick={() => setPin((p) => p.slice(0, -1))}
        >
          <Delete size={20} />
        </button>
        <button type="button" disabled={blocked} onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          className="pin-ok"
          aria-label={t('safety.lock.unlock')}
          disabled={blocked || pin.length < 4}
          onClick={() => void submit()}
        >
          <Check size={22} />
        </button>
      </div>
    </div>
  );
}
