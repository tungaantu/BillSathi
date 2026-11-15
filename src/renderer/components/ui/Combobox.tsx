import { useId, useRef, useState } from 'react';
import * as RP from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from './primitives';
export interface Option {
  value: string;
  label: string;
}
export function Combobox({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(''),
    [active, setActive] = useState(0);
  const filtered = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const choose = (value: string) => {
    onChange(value);
    setOpen(false);
    setSearch('');
  };
  return (
    <RP.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        setSearch('');
        setActive(0);
      }}
    >
      <RP.Trigger asChild>
        <button
          type="button"
          className="input select"
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          disabled={disabled}
        >
          {options.find((option) => option.value === value)?.label ?? t('select')}
          <ChevronDown size={16} />
        </button>
      </RP.Trigger>
      <RP.Portal>
        <RP.Content
          className="popover combo"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
        >
          <Input
            ref={input}
            aria-label={label}
            placeholder={t('search')}
            value={search}
            aria-controls={id}
            aria-activedescendant={filtered[active] ? `${id}-${active}` : undefined}
            onChange={(e) => {
              setSearch(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((n) =>
                  Math.max(0, Math.min(filtered.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))),
                );
              }
              if (e.key === 'Enter' && filtered[active]) {
                e.preventDefault();
                choose(filtered[active].value);
              }
            }}
          />
          <div role="listbox" id={id} aria-label={label} className="options">
            {filtered.map((option, index) => (
              <button
                id={`${id}-${index}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                className={`option ${active === index ? 'active' : ''}`}
                onClick={() => choose(option.value)}
              >
                {option.label}
                {value === option.value && <Check size={16} />}
              </button>
            ))}
            {!filtered.length && <p className="muted">{t('noResults')}</p>}
          </div>
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}
export const Select = Combobox;
