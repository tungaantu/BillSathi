import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleHelp, Info, X, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Popover } from './primitives';
import { useApp } from '../../app/state';
export function HelpTip({ id }: { id: string }) {
  const { t } = useTranslation();
  return (
    <Popover
      trigger={
        <button
          type="button"
          className="help-tip"
          aria-label={t('help') + ': ' + t(`help.${id}.title`)}
        >
          <CircleHelp size={15} />
        </button>
      }
    >
      <div className="help-content">
        <strong>{t(`help.${id}.title`)}</strong>
        <p>{t(`help.${id}.body`)}</p>
        <div className="help-example">{t(`help.${id}.example`)}</div>
      </div>
    </Popover>
  );
}
export function Field({
  id,
  label,
  help,
  children,
  error,
}: {
  id: string;
  label: string;
  help?: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {help && <HelpTip id={help} />}
      </div>
      {children}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function InfoBanner({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation();
  const { settings, saveSetting } = useApp();
  if (settings[`banner.${id}`]) return null;
  return (
    <div className="info-banner">
      <Info size={20} />
      <div>{children}</div>
      <IconButton
        label={t('close')}
        onClick={() => void saveSetting(`banner.${id}`, true, true).catch(() => {})}
      >
        <X size={16} />
      </IconButton>
    </div>
  );
}
export interface TourStep {
  target: string;
  title: string;
  body: string;
}
export const STANDARD_STEPS: TourStep[] = [
  { target: '[data-tour="navigation"]', title: 'tourNav', body: 'tourNavBody' },
  { target: '[data-tour="search"]', title: 'tourSearch', body: 'tourSearchBody' },
  { target: '[data-tour="content"]', title: 'tourContent', body: 'tourContentBody' },
];
export function replayTour() {
  window.dispatchEvent(new CustomEvent('replay-tour'));
}
export function Tour({ screen, steps = STANDARD_STEPS }: { screen: string; steps?: TourStep[] }) {
  const { t } = useTranslation();
  const { settings, saveSetting, firm } = useApp();
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!settings[`tour.${screen}`]) setStep(0);
    }, 650);
    const replay = () => setStep(0);
    window.addEventListener('replay-tour', replay);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('replay-tour', replay);
    };
  }, [screen, firm?.id, settings]);
  useEffect(() => {
    if (step === null) return;
    const update = () =>
      setRect(document.querySelector(steps[step].target)?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step, steps]);
  useEffect(() => {
    if (step === null) return;
    const finish = () => {
      setStep(null);
      void saveSetting(`tour.${screen}`, true, true).catch(() => {});
    };
    const click = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) finish();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    document.addEventListener('pointerdown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', click);
      document.removeEventListener('keydown', key);
    };
  }, [step, saveSetting, screen]);
  if (step === null || !rect) return null;
  const finish = () => {
    setStep(null);
    void saveSetting(`tour.${screen}`, true, true).catch(() => {});
  };
  const top = Math.min(rect.bottom + 12, window.innerHeight - 230);
  const left = Math.min(Math.max(rect.left, 24), window.innerWidth - 360);
  return (
    <>
      <div
        className="tour-spotlight"
        style={{
          left: rect.left - 4,
          top: rect.top - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />
      <div
        ref={box}
        className="tour-card"
        role="region"
        aria-label={t('help')}
        style={{ top, left }}
      >
        <span className="eyebrow">{t('step', { current: step + 1, total: steps.length })}</span>
        <h3>{t(steps[step].title)}</h3>
        <p>{t(steps[step].body)}</p>
        <div className="section-heading">
          <Button variant="ghost" onClick={finish}>
            {t('skip')}
          </Button>
          <Button onClick={() => (step === steps.length - 1 ? finish() : setStep(step + 1))}>
            {t(step === steps.length - 1 ? 'done' : 'next')}
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </>
  );
}
