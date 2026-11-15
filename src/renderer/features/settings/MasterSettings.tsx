import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/state';
import { Checkbox, Field, Input, Select } from '../../components/ui';
import { LookupManager } from '../masters/LookupManager';
export function MasterSettings({ kind }: { kind: 'party' | 'item' }) {
  const { t } = useTranslation(),
    { settings, saveSetting } = useApp();
  return (
    <>
      <section className="card master-detail stack">
        <h3>{t('masters.customFields')}</h3>
        <p className="muted">{t('masters.customHelp')}</p>
        {[1, 2, 3, 4].map((n) => (
          <div className="form-grid" key={n}>
            <Field
              id={`${kind}-${n}`}
              label={t('masters.customName', { n })}
              help="master-customFields"
            >
              <Input
                id={`${kind}-${n}`}
                maxLength={80}
                defaultValue={String(settings[`${kind}Custom${n}Name`] ?? '')}
                onBlur={(e) => {
                  if (e.target.value !== (settings[`${kind}Custom${n}Name`] ?? ''))
                    void saveSetting(`${kind}Custom${n}Name`, e.target.value).catch(() => {});
                }}
              />
            </Field>
            <Field
              id={`${kind}-type-${n}`}
              label={t('masters.customType')}
              help="master-customFields"
            >
              <Select
                label={t('masters.customType')}
                value={String(settings[`${kind}Custom${n}Type`] ?? 'text')}
                onChange={(v) => void saveSetting(`${kind}Custom${n}Type`, v).catch(() => {})}
                options={['text', 'date'].map((value) => ({ value, label: t(`masters.${value}`) }))}
              />
            </Field>
            <Field
              id={`${kind}-print-${n}`}
              label={t('masters.showPrint')}
              help="master-customFields"
            >
              <Checkbox
                label={t('masters.showPrint')}
                checked={Boolean(settings[`${kind}Custom${n}Print`])}
                onCheckedChange={(v) =>
                  void saveSetting(`${kind}Custom${n}Print`, v).catch(() => {})
                }
              />
            </Field>
          </div>
        ))}
      </section>
      {kind === 'party' && Boolean(settings.partyGroups) && <LookupManager kind="groups" />}
    </>
  );
}
