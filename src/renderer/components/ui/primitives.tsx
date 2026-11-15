import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import * as RD from '@radix-ui/react-dialog';
import * as RP from '@radix-ui/react-popover';
import * as RT from '@radix-ui/react-tooltip';
import * as RM from '@radix-ui/react-dropdown-menu';
import * as RC from '@radix-ui/react-checkbox';
import * as RS from '@radix-ui/react-switch';
import * as RTab from '@radix-ui/react-tabs';
import { Check, X, PackageOpen, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatINR, paiseToDecimal, rupeesToPaise } from '../../../shared/money';
import { DateInput } from './DateInput';
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return <button type="button" className={`button ${variant} ${className}`} {...props} />;
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip text={label}>
      <button type="button" className="icon-button" aria-label={label} {...props}>
        {children}
      </button>
    </Tooltip>
  );
}
export function Input(
  props: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> },
) {
  if (props.type === 'date') return <DateInput {...props} />;
  return <input className="input" {...props} />;
}
export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input type="number" inputMode="decimal" {...props} />;
}
export function MoneyInput({
  value,
  onValueChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number;
  onValueChange: (value: number) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null),
    [invalid, setInvalid] = useState(false);
  const errorId = useId();
  return (
    <div>
      <Input
        inputMode="decimal"
        {...props}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : props['aria-describedby']}
        value={draft ?? paiseToDecimal(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          try {
            onValueChange(rupeesToPaise(e.target.value || '0'));
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
        onBlur={() => {
          try {
            if (draft !== null) onValueChange(rupeesToPaise(draft || '0'));
            setDraft(null);
          } catch {
            setInvalid(true);
          }
        }}
      />
      {invalid && (
        <p id={errorId} className="field-error" role="alert">
          {t('moneyError')}
        </p>
      )}
    </div>
  );
}
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <RT.Provider delayDuration={500}>
      <RT.Root>
        <RT.Trigger asChild>{children}</RT.Trigger>
        <RT.Portal>
          <RT.Content className="tooltip" sideOffset={6}>
            {text}
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  );
}
export function Popover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  return (
    <RP.Root>
      <RP.Trigger asChild>{trigger}</RP.Trigger>
      <RP.Portal>
        <RP.Content className="popover" sideOffset={8}>
          {children}
          <RP.Arrow className="popover-arrow" />
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="overlay" />
        <RD.Content className={`dialog ${className}`}>
          <div className="section-heading">
            <RD.Title>{title}</RD.Title>
            <RD.Close asChild>
              <IconButton label={t('close')}>
                <X size={18} />
              </IconButton>
            </RD.Close>
          </div>
          <RD.Description className={description ? 'muted' : 'sr-only'}>
            {description ?? title}
          </RD.Description>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
export function Sheet(props: Parameters<typeof Dialog>[0]) {
  return <Dialog {...props} className={`sheet ${props.className ?? ''}`} />;
}
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <p>{children}</p>
      <div className="form-actions">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t('cancel')}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {t('confirm')}
        </Button>
      </div>
    </Dialog>
  );
}
export function Checkbox({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  const id = useId();
  return (
    <label className="check-label" htmlFor={id}>
      <RC.Root
        id={id}
        className="checkbox"
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
      >
        <RC.Indicator>
          <Check size={14} />
        </RC.Indicator>
      </RC.Root>
      {label}
    </label>
  );
}
export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <RS.Root
      aria-label={label}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="switch"
    >
      <RS.Thumb className="switch-thumb" />
    </RS.Root>
  );
}
export function Tabs({
  value,
  onValueChange,
  tabs,
}: {
  value: string;
  onValueChange: (v: string) => void;
  tabs: { value: string; label: string }[];
}) {
  return (
    <RTab.Root value={value} onValueChange={onValueChange}>
      <RTab.List className="tabs">
        {tabs.map((tab) => (
          <RTab.Trigger key={tab.value} className="tab" value={tab.value}>
            {tab.label}
          </RTab.Trigger>
        ))}
      </RTab.List>
    </RTab.Root>
  );
}
export function DropdownMenu({
  trigger,
  items,
}: {
  trigger: ReactNode;
  items: { label: string; onSelect: () => void; icon?: ReactNode }[];
}) {
  return (
    <RM.Root>
      <RM.Trigger asChild>{trigger}</RM.Trigger>
      <RM.Portal>
        <RM.Content className="dropdown" sideOffset={8}>
          {items.map((item) => (
            <RM.Item className="menu-item" key={item.label} onSelect={item.onSelect}>
              {item.icon}
              {item.label}
            </RM.Item>
          ))}
        </RM.Content>
      </RM.Portal>
    </RM.Root>
  );
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}
export function Skeleton() {
  return <div className="skeleton" aria-busy="true" />;
}
export function MoneyText({
  value,
  tone,
  decimals = 2,
}: {
  value: number;
  tone?: 'success' | 'danger';
  decimals?: number;
}) {
  return <span className={`money ${tone ?? ''}`}>{formatINR(value, decimals)}</span>;
}
export function StatCard({
  label,
  value,
  icon,
  tone,
  decimals,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: 'success' | 'danger';
  decimals?: number;
}) {
  return (
    <div className="card stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone ?? ''}`}>{icon}</span>
      </div>
      <MoneyText value={value} tone={tone} decimals={decimals} />
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
  onAction,
  onHelp,
  icon = <PackageOpen size={30} />,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
  onHelp?: () => void;
  icon?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      <Button onClick={onAction}>
        {action}
        <ArrowRight size={16} />
      </Button>
      {onHelp && (
        <Button variant="ghost" onClick={onHelp}>
          {t('watch')}
        </Button>
      )}
    </div>
  );
}
