import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Warehouse } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  HelpTip,
  Input,
  Select,
  useToast,
} from '../../components/ui';
import { advanceField, useSaveShortcut } from '../../app/keyboard';
import { useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import type { Godown } from '../../../shared/inventory-api';
import { useSales } from '../sales/common';
import { useGodowns } from './common';

function GodownDialog({ value, onClose }: { value: Godown | 'new'; onClose: () => void }) {
  const { t } = useTranslation(),
    { firmId, invalidate, error } = useSales(),
    toast = useToast();
  const [name, setName] = useState(value === 'new' ? '' : value.name),
    [address, setAddress] = useState(value === 'new' ? '' : value.address),
    [problem, setProblem] = useState(''),
    form = useRef<HTMLFormElement>(null);
  useSaveShortcut(form);
  async function save() {
    if (!name.trim()) return setProblem(t('inventory.error.name'));
    try {
      unwrap(
        await window.api.inventory.saveGodown(firmId, value === 'new' ? null : value.id, {
          name,
          address,
        }),
      );
      await invalidate();
      toast(t('saved'));
      onClose();
    } catch (e) {
      if (e instanceof Error && e.message === 'duplicate')
        setProblem(t('inventory.error.duplicateGodown'));
      else error(e);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={t(value === 'new' ? 'inventory.godown.new' : 'inventory.godown.edit')}
    >
      <form
        ref={form}
        className="stack"
        onKeyDown={advanceField}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field
          id="godown-name"
          label={t('inventory.godown.name')}
          help="inventory-godown"
          error={problem}
        >
          <Input
            id="godown-name"
            autoFocus
            maxLength={80}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setProblem('');
            }}
          />
        </Field>
        <Field id="godown-address" label={t('inventory.godown.address')}>
          <Input
            id="godown-address"
            maxLength={500}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Button type="submit">{t('save')}</Button>
      </form>
    </Dialog>
  );
}

export function Godowns() {
  const { t } = useTranslation(),
    { firmId, invalidate, error } = useSales(),
    { navigate } = useNavigation(),
    toast = useToast();
  const godowns = useGodowns();
  const [editing, setEditing] = useState<Godown | 'new' | null>(null),
    [removing, setRemoving] = useState<Godown | null>(null),
    [selected, setSelected] = useState('');
  const shown = selected || String(godowns.data?.[0]?.id ?? '');
  const stock = useQuery({
    queryKey: ['godownStock', firmId, shown],
    queryFn: async () =>
      unwrap(await window.api.inventory.godownStock(firmId, Number(shown) || null)),
    enabled: Boolean(shown),
  });
  async function remove(g: Godown) {
    try {
      unwrap(await window.api.inventory.deleteGodown(firmId, g.id));
      await invalidate();
      toast(t('inventory.godown.deleted'));
    } catch (e) {
      if (e instanceof Error && e.message === 'linked') toast(t('inventory.error.godownInUse'));
      else error(e);
    }
  }
  const list = godowns.data ?? [];
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>{t('nav.godowns')}</h1>
          <p className="muted">
            {t('inventory.godown.intro')} <HelpTip id="inventory-godown" />
          </p>
        </div>
        <div className="button-row" data-tour="inventory-new">
          <Button variant="secondary" onClick={() => navigate('stockTransfers')}>
            {t('nav.stockTransfers')}
          </Button>
          <Button onClick={() => setEditing('new')}>{t('inventory.godown.new')}</Button>
        </div>
      </div>
      <section className="card-grid" data-tour="inventory-list">
        {list.map((g) => (
          <article className="card stack" key={g.id}>
            <div className="section-heading">
              <h2>
                <Warehouse size={18} /> {g.name}
              </h2>
              {g.main && g.name !== t('inventory.godown.main') && (
                <Badge>{t('inventory.godown.main')}</Badge>
              )}
            </div>
            <p className="muted">{g.address || t('inventory.godown.noAddress')}</p>
            <p>{t('inventory.godown.summary', { count: g.items, qty: g.qty })}</p>
            <div className="button-row" data-tour="inventory-actions">
              <Button variant="secondary" onClick={() => setSelected(String(g.id))}>
                {t('inventory.godown.viewStock')}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(g)}>
                {t('masters.edit')}
              </Button>
              {!g.main && (
                <Button variant="ghost" onClick={() => setRemoving(g)}>
                  {t('masters.delete')}
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>
      <section className="card stack inventory-panel">
        <div className="section-heading">
          <h2>{t('inventory.godown.stockTitle')}</h2>
          <Select
            label={t('inventory.godown.pick')}
            value={shown}
            options={list.map((g) => ({ value: String(g.id), label: g.name }))}
            onChange={setSelected}
          />
        </div>
        {!stock.data?.length ? (
          <EmptyState
            title={t('inventory.godown.empty')}
            description={t('inventory.godown.emptyBody')}
            action={t('nav.stockTransfers')}
            onAction={() => navigate('stockTransfers')}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('inventory.col.item')}</th>
                  <th className="num">{t('inventory.col.qty')}</th>
                </tr>
              </thead>
              <tbody>
                {stock.data.map((r) => (
                  <tr key={r.itemId}>
                    <td>
                      <button className="link" onClick={() => navigate(`items/${r.itemId}`)}>
                        {r.item}
                      </button>
                    </td>
                    <td className="num">{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <GodownDialog value={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={t('inventory.godown.deleteTitle', { name: removing?.name ?? '' })}
        onConfirm={() => {
          if (removing) void remove(removing);
          setRemoving(null);
        }}
      >
        {t('inventory.godown.deleteBody')}
      </ConfirmDialog>
    </div>
  );
}
