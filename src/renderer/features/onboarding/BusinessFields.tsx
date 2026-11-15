import { useTranslation } from 'react-i18next';
import type { UseFormReturn } from 'react-hook-form';
import { Field, Input, Select } from '../../components/ui';
import { CATEGORIES, STATES } from '../../../shared/constants';
import { extractGSTIN, formatGSTIN, validateGSTIN } from '../../../shared/gstin';
import type { FirmInput } from '../../../shared/types';
export const BLANK_FIRM: FirmInput = {
  name: '',
  phone: '',
  category: 'grocery',
  stateCode: '',
  gstin: '',
  address: '',
  pan: '',
  email: '',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  upiId: '',
  demo: false,
};
export function BusinessFields({
  form,
  section,
}: {
  form: UseFormReturn<FirmInput>;
  section: 'business' | 'tax' | 'contact' | 'bank';
}) {
  const { t, i18n } = useTranslation();
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const message = (key: keyof FirmInput) =>
    errors[key]
      ? t(
          key === 'phone'
            ? 'phoneError'
            : key === 'gstin'
              ? 'gstinError'
              : key === 'email'
                ? 'emailError'
                : key === 'stateCode' && watch('gstin')
                  ? 'stateError'
                  : ['pan', 'accountNumber', 'ifsc', 'upiId'].includes(key)
                    ? 'profileError'
                    : 'required',
        )
      : undefined;
  const simple = (
    key:
      | 'name'
      | 'phone'
      | 'address'
      | 'email'
      | 'pan'
      | 'bankName'
      | 'accountNumber'
      | 'ifsc'
      | 'upiId',
    required = false,
  ) => (
    <Field key={key} id={key} label={t(`field.${key}`)} help={key} error={message(key)}>
      <Input
        id={key}
        autoComplete={
          key === 'name'
            ? 'organization'
            : key === 'phone'
              ? 'tel-national'
              : key === 'email'
                ? 'email'
                : 'off'
        }
        {...register(key, {
          required,
          maxLength: key === 'address' ? 1000 : 120,
          validate: (value) =>
            key === 'phone'
              ? /^\d{10}$/.test(String(value))
              : key === 'email'
                ? !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
                : true,
        })}
        inputMode={key === 'phone' || key === 'accountNumber' ? 'numeric' : undefined}
      />
    </Field>
  );
  if (section === 'business')
    return (
      <>
        {simple('name', true)}
        {simple('phone', true)}
        <Field id="category" label={t('field.category')} help="category">
          <Select
            label={t('field.category')}
            value={watch('category')}
            onChange={(value) => setValue('category', value as FirmInput['category'])}
            options={CATEGORIES.map((value) => ({ value, label: t(`category.${value}`) }))}
          />
        </Field>
      </>
    );
  if (section === 'tax')
    return (
      <>
        <Field
          id="gstin"
          label={`${t('field.gstin')} · ${t('optional')}`}
          help="gstin"
          error={message('gstin')}
        >
          <Input
            id="gstin"
            maxLength={15}
            className="input uppercase"
            {...register('gstin', {
              validate: (value) => !value || validateGSTIN(value),
              onChange: (e) => {
                const gstin = formatGSTIN(e.target.value);
                setValue('gstin', gstin);
                const parsed = extractGSTIN(gstin);
                if (parsed) {
                  setValue('stateCode', parsed.stateCode, { shouldValidate: true });
                  setValue('pan', parsed.pan);
                }
              },
            })}
          />
        </Field>
        <Field
          id="stateCode"
          label={t('field.stateCode')}
          help="stateCode"
          error={message('stateCode')}
        >
          <input type="hidden" {...register('stateCode', { required: true })} />
          <Select
            label={t('field.stateCode')}
            value={watch('stateCode')}
            onChange={(value) => setValue('stateCode', value, { shouldValidate: true })}
            options={STATES.map((state) => ({
              value: state.code,
              label: `${i18n.language === 'hi' ? state.hi : state.en} · ${state.code}`,
            }))}
          />
        </Field>
        {simple('address')}
      </>
    );
  if (section === 'contact')
    return (
      <>
        {simple('email')}
        {simple('pan')}
      </>
    );
  return (
    <>
      {simple('bankName')}
      {simple('accountNumber')}
      {simple('ifsc')}
      {simple('upiId')}
    </>
  );
}
