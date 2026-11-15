import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { Banknote, CreditCard, QrCode, Split } from 'lucide-react';
import { Button, Dialog, Field, MoneyInput, MoneyText } from '../../components/ui';
import { posChange, settlePos, type PosPart, type PosMethod } from '../../../shared/inventory';
import { formatINR } from '../../../shared/money';
import { buildUpiLink } from '../../../main/services/upi/upi-link';
import { useSales } from '../sales/common';

type Mode = PosMethod | 'split';
const METHODS: { id: Mode; icon: typeof Banknote }[] = [
  { id: 'cash', icon: Banknote },
  { id: 'upi', icon: QrCode },
  { id: 'card', icon: CreditCard },
  { id: 'split', icon: Split },
];

/** Take payment for a POS bill. Calls `onPaid` with the parts once they add up to the total. */
export function PosPay({
  total,
  initial = 'cash',
  onPaid,
  onClose,
}: {
  total: number;
  initial?: Mode;
  onPaid: (parts: PosPart[], change: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(),
    { firm } = useSales();
  const [mode, setMode] = useState<Mode>(initial),
    [tendered, setTendered] = useState(total),
    [split, setSplit] = useState<Record<PosMethod, number>>({ cash: total, upi: 0, card: 0 }),
    [qrImage, setQrImage] = useState({ link: '', url: '' }),
    [problem, setProblem] = useState('');
  const upiAmount = mode === 'upi' ? total : mode === 'split' ? split.upi : 0;
  const link =
    upiAmount > 0 && firm?.upiId
      ? buildUpiLink({
          upiId: firm.upiId,
          payeeName: firm.name,
          amountPaise: upiAmount,
          note: t('pos.title'),
          ref: '',
        })
      : '';
  // The QR image is drawn asynchronously; it only shows while it matches the current amount.
  const qr = link && qrImage.link === link ? qrImage.url : '';
  useEffect(() => {
    if (!link) return;
    let live = true;
    void QRCode.toDataURL(link, { margin: 1, width: 220 }).then(
      (url) => live && setQrImage({ link, url }),
    );
    return () => {
      live = false;
    };
  }, [link]);
  const parts: PosPart[] =
    mode === 'split'
      ? (['cash', 'upi', 'card'] as const)
          .map((m) => ({ method: m, amount: split[m] }))
          .filter((p) => p.amount > 0)
      : [{ method: mode, amount: total }];
  const splitPaid = split.cash + split.upi + split.card;
  function pay() {
    try {
      const cashTendered = mode === 'cash' ? tendered : 0;
      const { change } = settlePos(total, parts, cashTendered);
      onPaid(parts, change);
    } catch (e) {
      setProblem(
        t(e instanceof Error && e.message === 'overpayment' ? 'pos.error.over' : 'pos.error.short'),
      );
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={t('pos.pay.title')}>
      <form
        className="stack pos-pay"
        onSubmit={(e) => {
          e.preventDefault();
          pay();
        }}
      >
        <div className="pos-pay-total">
          <span>{t('pos.total')}</span>
          <MoneyText value={total} />
        </div>
        <div className="pos-methods" role="radiogroup" aria-label={t('pos.pay.method')}>
          {METHODS.map(({ id, icon: Icon }) => (
            <button
              type="button"
              key={id}
              role="radio"
              aria-checked={mode === id}
              className={mode === id ? 'active' : ''}
              onClick={() => {
                setMode(id);
                setProblem('');
              }}
            >
              <Icon size={22} />
              {t(`pos.method.${id}`)}
            </button>
          ))}
        </div>
        {mode === 'cash' && (
          <>
            <Field id="pos-tendered" label={t('pos.pay.tendered')} help="pos-change">
              <MoneyInput
                id="pos-tendered"
                autoFocus
                value={tendered}
                onValueChange={(v) => setTendered(v)}
              />
            </Field>
            <div className="pos-change">
              <span>{t('pos.pay.change')}</span>
              <MoneyText value={Math.max(0, posChange(total, tendered))} />
            </div>
          </>
        )}
        {mode === 'split' && (
          <div className="form-grid">
            {(['cash', 'upi', 'card'] as const).map((m) => (
              <Field key={m} id={`pos-split-${m}`} label={t(`pos.method.${m}`)}>
                <MoneyInput
                  id={`pos-split-${m}`}
                  value={split[m]}
                  onValueChange={(v) => setSplit({ ...split, [m]: v })}
                />
              </Field>
            ))}
            <p className={splitPaid === total ? 'muted' : 'field-error'}>
              {t('pos.pay.splitLeft', { amount: formatINR(total - splitPaid) })}
            </p>
          </div>
        )}
        {upiAmount > 0 &&
          (qr ? (
            <figure className="pos-qr">
              <img src={qr} alt={t('pos.pay.qr')} width={220} height={220} />
              <figcaption>{t('pos.pay.scan', { name: firm?.name ?? '' })}</figcaption>
            </figure>
          ) : (
            <p className="muted">{t('pos.pay.noUpi')}</p>
          ))}
        {problem && (
          <p role="alert" className="field-error">
            {problem}
          </p>
        )}
        <Button type="submit">
          {t(mode === 'cash' || mode === 'split' ? 'pos.pay.done' : 'pos.pay.received')}
        </Button>
      </form>
    </Dialog>
  );
}
