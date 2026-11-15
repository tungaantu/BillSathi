import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { firmInputSchema } from '../../../shared/validation';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Check,
  Leaf,
  ShieldCheck,
  Sparkles,
  Store,
  MapPin,
  LayoutDashboard,
} from 'lucide-react';
import { APP_NAME } from '../../../shared/constants';
import { unwrap, type FirmInput } from '../../../shared/types';
import { useApp, useNavigation } from '../../app/state';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import { Button, Badge } from '../../components/ui';
import { BLANK_FIRM, BusinessFields } from './BusinessFields';
export function Onboarding() {
  const { t } = useTranslation();
  const { refresh, selectFirm, error } = useApp();
  const { navigate } = useNavigation();
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false);
  const form = useForm<FirmInput>({
    defaultValues: BLANK_FIRM,
    shouldUnregister: false,
    resolver: zodResolver(firmInputSchema),
  });
  const ref = useRef<HTMLFormElement>(null);
  useSaveShortcut(ref);
  const titles = ['onboard1', 'onboard2', 'onboard3'];
  const illustrations = [Store, MapPin, LayoutDashboard];
  const Illustration = illustrations[step];
  async function advance() {
    const valid = await form.trigger(
      step === 0 ? ['name', 'phone', 'category'] : ['gstin', 'stateCode', 'address'],
    );
    if (valid) setStep(step + 1);
  }
  async function finish(input: FirmInput) {
    if (busy) return;
    setBusy(true);
    try {
      const firm = unwrap(await window.api.firm.create(input));
      selectFirm(firm.id);
      navigate('home');
      await refresh();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding">
      <div className="onboarding-art">
        <div className="wordmark">
          <span className="brand-symbol">
            <Leaf size={25} />
          </span>
          {APP_NAME}
        </div>
        <div className="art-copy">
          <Badge>{t('localOnly')}</Badge>
          <h1>{t('appIntro')}</h1>
          <p>{t('tagline')}</p>
          <div className="business-illustration">
            <div className="illustration-orbit" />
            <div className="illustration-store">
              <Illustration size={96} strokeWidth={1.3} />
            </div>
            <div className="illustration-chip chip-one">
              <ShieldCheck size={24} />
            </div>
            <div className="illustration-chip chip-two">
              <Sparkles size={24} />
            </div>
            <div className="illustration-chip chip-three">
              <Check size={24} />
            </div>
          </div>
        </div>
        <div className="offline-note">
          <ShieldCheck size={18} />
          {t('offline')}
        </div>
      </div>
      <main className="onboarding-main">
        <div className="wizard">
          <div className="wizard-progress">
            {['businessDetails', 'taxDetails', 'ready'].map((title, index) => (
              <div key={title} className={index <= step ? 'active' : ''}>
                <span>{index < step ? <Check size={16} /> : index + 1}</span>
                <small>{t(title)}</small>
              </div>
            ))}
          </div>
          <span className="eyebrow">{t('step', { current: step + 1, total: 3 })}</span>
          <h2>{t(titles[step])}</h2>
          <p className="muted">{t('onboardBody')}</p>
          <form
            ref={ref}
            onKeyDown={advanceField}
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 2) void advance();
              else void form.handleSubmit(finish)();
            }}
          >
            <div className="wizard-fields">
              {step < 2 ? (
                <BusinessFields form={form} section={step === 0 ? 'business' : 'tax'} />
              ) : (
                <div className="choices">
                  {[false, true].map((demo) => (
                    <label
                      className={`choice ${form.watch('demo') === demo ? 'selected' : ''}`}
                      key={String(demo)}
                    >
                      <input
                        type="radio"
                        name="demo-choice"
                        checked={form.watch('demo') === demo}
                        onChange={() => form.setValue('demo', demo)}
                      />
                      <span>
                        <strong>{t(demo ? 'demo' : 'fresh')}</strong>
                        <p>{t(demo ? 'demoChoiceBody' : 'freshBody')}</p>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="form-actions">
              {step > 0 && (
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  {t('back')}
                </Button>
              )}
              <Button type="submit" disabled={busy}>
                {t(busy ? 'saving' : step === 2 ? 'start' : 'next')}
                <ArrowRight size={17} />
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
