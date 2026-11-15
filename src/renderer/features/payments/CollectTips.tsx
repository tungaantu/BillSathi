import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui';
import { useApp } from '../../app/state';

const STEPS = ['qr', 'status', 'manual'] as const;
const KEY = 'tour.payments-collect';

/**
 * Short tour for the Collect dialog. The shared Tour overlay cannot be used here: a modal dialog
 * blocks clicks outside itself, so these tips live inside the dialog and highlight the
 * `[data-tip="…"]` blocks.
 */
export function CollectTips() {
  const { t } = useTranslation();
  const { settings, saveSetting } = useApp();
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!settings[KEY]) setStep(0);
    }, 500);
    const replay = () => setStep(0);
    window.addEventListener('replay-tour', replay);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('replay-tour', replay);
    };
  }, [settings]);
  useEffect(() => {
    for (const element of document.querySelectorAll('[data-tip]'))
      element.setAttribute(
        'data-tip-active',
        String(step !== null && element.getAttribute('data-tip') === STEPS[step]),
      );
    return () => {
      for (const element of document.querySelectorAll('[data-tip]'))
        element.removeAttribute('data-tip-active');
    };
  }, [step]);
  if (step === null) return null;
  const finish = () => {
    setStep(null);
    void saveSetting(KEY, true, true).catch(() => {});
  };
  const name = STEPS[step];
  return (
    <div className="collect-tip" role="region" aria-label={t('help')}>
      <strong>{t(`payments.tour.${name}`)}</strong>
      <p>{t(`payments.tour.${name}Body`)}</p>
      <div className="collect-tip-actions">
        <Button variant="ghost" onClick={finish}>
          {t('payments.tour.skip')}
        </Button>
        <Button onClick={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}>
          {t(step === STEPS.length - 1 ? 'payments.tour.done' : 'payments.tour.next')}
        </Button>
      </div>
    </div>
  );
}
