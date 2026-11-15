import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { Button, Dialog, HelpTip, Input, Select, useToast } from '../../components/ui';
import { calculate, gstOn } from '../../../shared/calc';
import './utilities.css';

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '%', '+'];
const RATES = ['5', '12', '18', '28'];
const show = (n: number) =>
  n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Calculator popup (Alt+C or the + menu): arithmetic, percentages and add/remove GST. */
export function Calculator({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(),
    toast = useToast();
  const [text, setText] = useState(''),
    [rate, setRate] = useState('18');
  const result = calculate(text);
  const gst =
    result === null
      ? null
      : { add: gstOn(result, Number(rate), false), remove: gstOn(result, Number(rate), true) };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={t('calc.title')}>
      <form
        className="stack calculator"
        onSubmit={(e) => {
          e.preventDefault();
          if (result !== null) setText(String(result));
        }}
      >
        <Input
          aria-label={t('calc.input')}
          autoFocus
          inputMode="decimal"
          placeholder="1250 × 2 + 18%"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <output className="calc-result" aria-live="polite">
          {text ? (result === null ? t('calc.invalid') : `= ${show(result)}`) : ' '}
        </output>
        <div className="calc-keys">
          {KEYS.map((k) => (
            <button type="button" key={k} onClick={() => setText((v) => v + k)}>
              {k}
            </button>
          ))}
          <button type="button" onClick={() => setText('')}>
            C
          </button>
          <button type="button" onClick={() => setText((v) => v + '(')}>
            (
          </button>
          <button type="button" onClick={() => setText((v) => v + ')')}>
            )
          </button>
          <button type="submit" className="equals">
            =
          </button>
        </div>
        <div className="calc-gst">
          <span className="field-label">
            {t('calc.gst')} <HelpTip id="calc-gst" />
          </span>
          <Select
            label={t('calc.rate')}
            value={rate}
            options={RATES.map((r) => ({ value: r, label: `${r}%` }))}
            onChange={setRate}
          />
        </div>
        {gst && (
          <dl className="calc-gst-table">
            <dt>{t('calc.addGst')}</dt>
            <dd>
              {show(gst.add.base)} + {show(gst.add.tax)} = <b>{show(gst.add.total)}</b>
            </dd>
            <dt>{t('calc.removeGst')}</dt>
            <dd>
              <b>{show(gst.remove.base)}</b> + {show(gst.remove.tax)} = {show(gst.remove.total)}
            </dd>
          </dl>
        )}
        <Button
          variant="secondary"
          disabled={result === null}
          onClick={() =>
            void navigator.clipboard
              .writeText(String(result))
              .then(() => toast(t('calc.copied')))
              .catch(() => {})
          }
        >
          <Copy size={16} /> {t('calc.copy')}
        </Button>
      </form>
    </Dialog>
  );
}
