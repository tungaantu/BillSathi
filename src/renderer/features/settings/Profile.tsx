import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { firmInputSchema } from '../../../shared/validation';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Save, Store } from 'lucide-react';
import { unwrap, type FirmInput } from '../../../shared/types';
import { useApp } from '../../app/state';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import { Button, HelpTip, useToast } from '../../components/ui';
import { BusinessFields } from '../onboarding/BusinessFields';
function ImageUpload({ kind }: { kind: 'logo' | 'signature' }) {
  const { t } = useTranslation();
  const { firm, refresh, error } = useApp();
  const toast = useToast();
  const image = useQuery({
    queryKey: ['image', firm?.id, kind, firm?.[kind]],
    queryFn: async () => unwrap(await window.api.firm.image(firm!.id, kind)),
  });
  async function upload() {
    try {
      const filename = unwrap(await window.api.firm.upload(firm!.id, kind));
      if (filename) {
        await refresh();
        toast(t('uploaded'));
      }
    } catch (e) {
      error(e);
    }
  }
  return (
    <div className="upload-card">
      <div className="image-preview">
        {image.data ? <img src={image.data} alt={t(kind)} /> : <ImagePlus size={28} />}
      </div>
      <div>
        <div className="field-label">
          <strong>{t(kind)}</strong>
          <HelpTip id={kind} />
        </div>
        <p className="muted small">{t('imageHint')}</p>
        <Button variant="secondary" onClick={() => void upload()}>
          {t('upload')}
        </Button>
      </div>
    </div>
  );
}
export function Profile() {
  const { t } = useTranslation();
  const { firm, refresh, error } = useApp();
  const toast = useToast();
  const form = useForm<FirmInput>({ defaultValues: firm, resolver: zodResolver(firmInputSchema) });
  const ref = useRef<HTMLFormElement>(null);
  useSaveShortcut(ref);
  async function save(input: FirmInput) {
    try {
      unwrap(await window.api.firm.update(firm!.id, input));
      await refresh();
      toast(t('saved'));
    } catch (e) {
      error(e);
    }
  }
  return (
    <form ref={ref} onKeyDown={advanceField} onSubmit={form.handleSubmit(save)}>
      <div className="section-heading">
        <div>
          <h2>
            <Store size={23} />
            {t('nav.profile')}
          </h2>
          <p className="muted">{t('profileBody')}</p>
        </div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <Save size={16} />
          {t(form.formState.isSubmitting ? 'saving' : 'save')}
        </Button>
      </div>
      <div className="profile-grid">
        <section className="card form-card">
          <h3>{t('businessDetails')}</h3>
          <div className="form-grid">
            <BusinessFields form={form} section="business" />
          </div>
          <h3>{t('contactDetails')}</h3>
          <div className="form-grid">
            <BusinessFields form={form} section="tax" />
            <BusinessFields form={form} section="contact" />
          </div>
        </section>
        <div className="stack">
          <section className="card form-card">
            <h3>{t('bankDetails')}</h3>
            <div className="form-grid one">
              <BusinessFields form={form} section="bank" />
            </div>
          </section>
          <section className="card form-card">
            <h3>{t('brandDetails')}</h3>
            <ImageUpload kind="logo" />
            <ImageUpload kind="signature" />
          </section>
        </div>
      </div>
    </form>
  );
}
