import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  HelpTip,
  Input,
  Select,
  useToast,
} from '../../components/ui';
import { useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import { formatINR } from '../../../shared/money';
import { canEncode, code128Svg } from '../../../shared/code128';
import type { LabelRequest } from '../../../shared/inventory-api';
import { useSales } from '../sales/common';

const LAYOUTS = ['a4-65', 'a4-48', 'a4-40', 'a4-24', 'roll-50x25', 'roll-38x25'];
const FIELDS = ['name', 'price', 'mrp', 'code', 'firm'] as const;
const valueOf = (i: { code: string; barcode?: string | null }) =>
  (i.barcode || i.code || '').trim();

export function BarcodeLabels() {
  const { t } = useTranslation(),
    { firmId, firm, items, error } = useSales(),
    { navigate } = useNavigation(),
    toast = useToast();
  const [copies, setCopies] = useState<Record<number, number>>({}),
    [search, setSearch] = useState(''),
    [layout, setLayout] = useState('a4-65'),
    [fields, setFields] = useState<LabelRequest['fields']>({
      name: true,
      price: true,
      mrp: false,
      code: true,
      firm: false,
    }),
    [busy, setBusy] = useState(false);
  const shown = items.filter(
    (i) =>
      i.type !== 'service' &&
      `${i.name} ${i.code} ${i.barcode ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  const chosen = Object.entries(copies)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ itemId: Number(id), copies: n }));
  const total = chosen.reduce((n, c) => n + c.copies, 0);
  const first = items.find((i) => i.id === chosen[0]?.itemId);
  const preview = useMemo(
    () => (first && canEncode(valueOf(first)) ? code128Svg(valueOf(first), { height: 48 }) : ''),
    [first],
  );
  async function output(mode: 'pdf' | 'print') {
    setBusy(true);
    try {
      const path = unwrap(
        await window.api.inventory.labels(firmId, { items: chosen, layout, fields }, mode),
      );
      if (path) toast(t('inventory.fileSaved'));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>{t('nav.barcodeLabels')}</h1>
          <p className="muted">
            {t('inventory.labels.intro')} <HelpTip id="inventory-labels" />
          </p>
        </div>
        <div className="button-row" data-tour="inventory-actions">
          <Button variant="secondary" disabled={!total || busy} onClick={() => void output('pdf')}>
            {t('reports.pdf')}
          </Button>
          <Button disabled={!total || busy} onClick={() => void output('print')}>
            {t('inventory.labels.print', { count: total })}
          </Button>
        </div>
      </div>
      <section className="card form-grid" data-tour="inventory-new">
        <Field id="label-layout" label={t('inventory.labels.layout')} help="inventory-labelLayout">
          <Select
            label={t('inventory.labels.layout')}
            value={layout}
            options={LAYOUTS.map((v) => ({ value: v, label: t(`inventory.layout.${v}`) }))}
            onChange={setLayout}
          />
        </Field>
        <div className="stack">
          <span className="field-label">{t('inventory.labels.fields')}</span>
          <div className="button-row">
            {FIELDS.map((f) => (
              <Checkbox
                key={f}
                label={t(`inventory.labels.field.${f}`)}
                checked={fields[f]}
                onCheckedChange={(v) => setFields({ ...fields, [f]: v })}
              />
            ))}
          </div>
        </div>
      </section>
      {first && (
        <section className="card label-preview" aria-label={t('inventory.labels.preview')}>
          {fields.firm && <small>{firm?.name}</small>}
          {fields.name && <strong>{first.name}</strong>}
          <div dangerouslySetInnerHTML={{ __html: preview }} />
          {fields.code && <small>{valueOf(first)}</small>}
          {fields.price && <span>{formatINR(first.salePrice)}</span>}
        </section>
      )}
      <section className="card stack" data-tour="inventory-list">
        <Input
          aria-label={t('inventory.labels.search')}
          placeholder={t('inventory.labels.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!shown.length ? (
          <EmptyState
            title={t('inventory.labels.empty')}
            description={t('inventory.labels.emptyBody')}
            action={t('masters.newItem')}
            onAction={() => navigate('items/new')}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('inventory.col.item')}</th>
                  <th>{t('inventory.col.code')}</th>
                  <th className="num">{t('inventory.labels.copies')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const ok = canEncode(valueOf(i));
                  return (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>
                        {ok ? (
                          valueOf(i)
                        ) : (
                          <button className="link" onClick={() => navigate(`items/${i.id}`)}>
                            {t('inventory.labels.needCode')}
                          </button>
                        )}
                      </td>
                      <td className="num">
                        <Input
                          aria-label={`${t('inventory.labels.copies')} ${i.name}`}
                          type="number"
                          min="0"
                          max="1000"
                          disabled={!ok}
                          value={copies[i.id] ?? 0}
                          onChange={(e) =>
                            setCopies({
                              ...copies,
                              [i.id]: Math.max(
                                0,
                                Math.min(1000, Math.floor(Number(e.target.value) || 0)),
                              ),
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
