import { useState, type InputHTMLAttributes, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/state';
import { formatDate, parseDate } from '../../../shared/dates';
export function DateInput({
  value,
  onChange,
  onBlur,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  const { settings } = useApp(),
    { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null),
    [invalid, setInvalid] = useState(false);
  return (
    <input
      {...props}
      type="text"
      className="input"
      inputMode="text"
      placeholder={String(settings.dateFormat ?? 'DD/MM/YYYY')}
      title={t('dateError')}
      aria-invalid={invalid || undefined}
      value={draft ?? formatDate(String(value ?? ''), settings)}
      onChange={(e) => {
        setDraft(e.target.value);
        try {
          const iso = parseDate(e.target.value, settings);
          e.target.setCustomValidity('');
          setInvalid(false);
          onChange?.({
            ...e,
            target: { ...e.target, value: iso },
            currentTarget: { ...e.currentTarget, value: iso },
          });
        } catch {
          setInvalid(true);
          e.target.setCustomValidity(t('dateError'));
        }
      }}
      onBlur={(e) => {
        if (!invalid) setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}
