import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LookupKind, Named } from '../../../shared/masters';
import { unwrap } from '../../../shared/types';
import { Button, ConfirmDialog, EmptyState, Table, useToast } from '../../components/ui';
import { Choice, QtyField, TextField, useMasters } from './common';
export function LookupManager({ kind }: { kind: LookupKind }) {
  const { t } = useTranslation(),
    toast = useToast(),
    { firmId, lookups, invalidate, error } = useMasters();
  const [name, setName] = useState(''),
    [symbol, setSymbol] = useState(''),
    [editing, setEditing] = useState<number | null>(null),
    [deleting, setDeleting] = useState<Named | null>(null);
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [factor, setFactor] = useState(1),
    [conversionId, setConversionId] = useState<number | null>(null),
    [deleteConversion, setDeleteConversion] = useState<number | null>(null);
  const rows =
    kind === 'groups'
      ? lookups.groups
      : kind === 'categories'
        ? lookups.categories
        : lookups.units.map((u) => ({ ...u, count: 0 }));
  async function save() {
    try {
      unwrap(await window.api.masters.saveLookup(firmId, kind, editing, name, symbol));
      setName('');
      setSymbol('');
      setEditing(null);
      await invalidate();
      toast(t('saved'));
    } catch (e) {
      error(e);
    }
  }
  async function remove() {
    if (!deleting) return;
    try {
      unwrap(await window.api.masters.deleteLookup(firmId, kind, deleting.id));
      setDeleting(null);
      await invalidate();
      toast(t('masters.deleted'));
    } catch (e) {
      error(e);
    }
  }
  async function saveConversion() {
    try {
      unwrap(
        await window.api.masters.saveConversion(
          firmId,
          conversionId,
          Number(from),
          Number(to),
          factor,
        ),
      );
      setConversionId(null);
      setFrom('');
      setTo('');
      setFactor(1);
      await invalidate();
      toast(t('saved'));
    } catch (e) {
      error(e);
    }
  }
  return (
    <section className="card master-detail stack">
      <h3>{t(`masters.${kind}`)}</h3>
      <p className="muted">{t('masters.lookupHelp')}</p>
      <form
        className="inline-create"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField name="name" value={name} onChange={setName} required />
        {kind === 'units' && (
          <TextField name="symbol" value={symbol} onChange={setSymbol} required />
        )}
        <Button type="submit" disabled={!name.trim()}>
          {t(editing ? 'save' : 'masters.create')}
        </Button>
        {editing && (
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(null);
              setName('');
              setSymbol('');
            }}
          >
            {t('cancel')}
          </Button>
        )}
      </form>
      <Table
        data={rows}
        empty={
          <EmptyState
            title={t('noResults')}
            description={t('masters.lookupHelp')}
            action={t('masters.create')}
            onAction={() => document.getElementById('master-name')?.focus()}
          />
        }
        columns={[
          { accessorKey: 'name', header: t('masters.name') },
          ...(kind === 'units'
            ? [
                {
                  id: 'symbol',
                  header: t('masters.symbol'),
                  cell: ({ row }: { row: { original: Named } }) =>
                    lookups.units.find((u) => u.id === row.original.id)?.symbol,
                },
              ]
            : [{ accessorKey: 'count', header: t('masters.itemCount') }]),
          {
            id: 'actions',
            header: t('masters.actions'),
            cell: (c) =>
              kind === 'units' &&
              lookups.units.find((u) => u.id === c.row.original.id)?.standard ? (
                <span className="muted">{t('masters.standard')}</span>
              ) : (
                <div className="button-row">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(c.row.original.id);
                      setName(c.row.original.name);
                      setSymbol(
                        lookups.units.find((u) => u.id === c.row.original.id)?.symbol ?? '',
                      );
                    }}
                  >
                    {t('masters.edit')}
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleting(c.row.original)}>
                    {t('masters.delete')}
                  </Button>
                </div>
              ),
          },
        ]}
      />
      {kind === 'units' && (
        <>
          <h3>{t('masters.conversions')}</h3>
          <div className="form-grid">
            <Choice
              name="fromUnit"
              value={from}
              onChange={setFrom}
              options={lookups.units.map((u) => ({ value: String(u.id), label: u.symbol }))}
            />
            <Choice
              name="toUnit"
              value={to}
              onChange={setTo}
              options={lookups.units.map((u) => ({ value: String(u.id), label: u.symbol }))}
            />
            <QtyField name="conversion" value={factor} onChange={setFactor} />
            <Button
              disabled={!from || !to || from === to || factor <= 0}
              onClick={() => void saveConversion()}
            >
              {t('save')}
            </Button>
          </div>
          <Table
            data={lookups.conversions}
            empty={<p className="muted">{t('masters.conversionHelp')}</p>}
            columns={[
              {
                id: 'conversion',
                header: t('masters.conversion'),
                cell: (c) =>
                  t('masters.conversionPreview', {
                    secondary: lookups.units.find((u) => u.id === c.row.original.fromUnit)?.symbol,
                    factor: c.row.original.factor,
                    base: lookups.units.find((u) => u.id === c.row.original.toUnit)?.symbol,
                  }),
              },
              {
                id: 'actions',
                header: t('masters.actions'),
                cell: (c) => (
                  <div className="button-row">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setConversionId(c.row.original.id);
                        setFrom(String(c.row.original.fromUnit));
                        setTo(String(c.row.original.toUnit));
                        setFactor(c.row.original.factor);
                      }}
                    >
                      {t('masters.edit')}
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleteConversion(c.row.original.id)}>
                      {t('masters.delete')}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(v) => {
          if (!v) setDeleting(null);
        }}
        title={t('masters.delete')}
        onConfirm={() => void remove()}
      >
        {t('masters.deleteUnused', { name: deleting?.name })}
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteConversion !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteConversion(null);
        }}
        title={t('masters.delete')}
        onConfirm={() => {
          if (deleteConversion)
            void window.api.masters
              .deleteConversion(firmId, deleteConversion)
              .then(unwrap)
              .then(async () => {
                setDeleteConversion(null);
                await invalidate();
                toast(t('masters.deleted'));
              })
              .catch(error);
        }}
      >
        {t('masters.deleteConversion')}
      </ConfirmDialog>
    </section>
  );
}
