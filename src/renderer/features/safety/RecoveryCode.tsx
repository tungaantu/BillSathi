import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, KeyRound } from 'lucide-react';
import { Button } from '../../components/ui';

/** Shows the one-time recovery code and makes the owner confirm they stored it. */
export function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack recovery">
      <div className="empty-icon">
        <KeyRound size={28} />
      </div>
      <h3>{t('safety.lock.recoveryTitle')}</h3>
      <p className="muted">{t('safety.lock.recoveryBody')}</p>
      <div className="recovery-code" aria-label={t('safety.lock.recoveryCode')}>
        {code}
      </div>
      <div className="button-row">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(code)
              .then(() => setCopied(true))
              .catch(() => {});
          }}
        >
          <Copy size={16} />
          {copied ? t('safety.lock.copied') : t('safety.lock.copy')}
        </Button>
        <Button onClick={onDone}>{t('safety.lock.savedIt')}</Button>
      </div>
    </div>
  );
}
