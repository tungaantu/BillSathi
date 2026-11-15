import { PartyFeatures } from '../customers/PartyFeatures';
import { formatDate } from '../../../shared/dates';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users, Plus } from 'lucide-react';
import { unwrap } from '../../../shared/types';
import type { Party } from '../../../shared/masters';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  MoneyText,
  Select,
  Table,
  Tabs,
  useToast,
  useShowMore,
} from '../../components/ui';
import { useNavigation } from '../../app/state';
import { useMasters } from '../masters/common';
import { PartySheet } from './PartySheet';
export function Parties({ selected, create = false }: { selected?: number; create?: boolean }) {
  const { t } = useTranslation(),
    toast = useToast(),
    { navigate } = useNavigation();
  const { firmId, settings, invalidate, error } = useMasters();
  const [detailTab, setDetailTab] = useState('transactions');
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [sort, setSort] = useState('name');
  const [selection, setSelection] = useState<number | undefined>(selected),
    [edit, setEdit] = useState<Party | null | undefined>(create ? null : undefined);
  const [deleting, setDeleting] = useState(false),
    [statement, setStatement] = useState(false),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const query = useQuery({
    queryKey: ['parties', firmId],
    queryFn: async () => unwrap(await window.api.masters.parties(firmId)),
  });
  const parties = query.data ?? [];
  const rows = parties
    .filter(
      (p) =>
        `${p.name} ${p.phone} ${p.gstin}`.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'all' || (filter === 'receive' ? p.balance > 0 : p.balance < 0)),
    )
    .sort((a, b) =>
      sort === 'balance'
        ? b.balance - a.balance
        : sort === 'recent'
          ? b.id - a.id
          : a.name.localeCompare(b.name),
    );
  const { visible: shownRows, more } = useShowMore(rows);
  const party = parties.find((p) => p.id === selection) ?? rows[0];
  const ledger = useQuery({
    queryKey: ['party-ledger', firmId, party?.id, from, to],
    queryFn: async () => unwrap(await window.api.masters.ledger(firmId, party!.id, from, to)),
    enabled: Boolean(party),
  });
  async function remove() {
    if (!party) return;
    const id = party.id;
    try {
      unwrap(await window.api.masters.remove(firmId, 'parties', id));
      setDeleting(false);
      await invalidate();
      toast(t('masters.deleted'), {
        undo: () => {
          void window.api.masters
            .remove(firmId, 'parties', id, true)
            .then(unwrap)
            .then(() => invalidate())
            .then(() => toast(t('masters.restored')))
            .catch(error);
        },
      });
    } catch (e) {
      error(e);
    }
  }
  const empty = (
    <EmptyState
      title={t('masters.noParties')}
      description={t('masters.partiesBody')}
      action={t('masters.newParty')}
      onAction={() => setEdit(null)}
      icon={<Users size={30} />}
    />
  );
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('masters.people')}</span>
          <h1>{t('nav.parties')}</h1>
          <p className="muted">{t('masters.partiesBody')}</p>
        </div>
        <Button data-tour="master-new" onClick={() => setEdit(null)}>
          <Plus size={17} />
          {t('masters.newParty')}
        </Button>
      </div>
      {query.isError ? (
        <EmptyState
          title={t('error')}
          description={t('storage')}
          action={t('retry')}
          onAction={() => void query.refetch()}
        />
      ) : (
        <div className="master-split">
          <section className="card master-list" data-tour="master-list">
            <Input
              aria-label={t('search')}
              placeholder={t('masters.partySearch')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="master-filters">
              <Select
                label={t('masters.filter')}
                value={filter}
                onChange={setFilter}
                options={['all', 'receive', 'pay'].map((value) => ({
                  value,
                  label: t(`masters.${value}`),
                }))}
              />
              <Select
                label={t('masters.sort')}
                value={sort}
                onChange={setSort}
                options={['name', 'balance', 'recent'].map((value) => ({
                  value,
                  label: t(`masters.${value}`),
                }))}
              />
            </div>
            {!rows.length ? (
              query.isPending ? (
                <p>{t('loading')}</p>
              ) : (
                empty
              )
            ) : (
              <div className="master-rows">
                {shownRows.map((p) => (
                  <button
                    className={`master-row ${p.id === party?.id ? 'selected' : ''}`}
                    key={p.id}
                    onClick={() => {
                      setSelection(p.id);
                      setStatement(false);
                      setFrom('');
                      setTo('');
                    }}
                  >
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.phone || t('masters.noPhone')}
                        {!p.active ? ` · ${t('masters.inactive')}` : ''}
                      </small>
                    </span>
                    <MoneyText value={p.balance} tone={p.balance < 0 ? 'danger' : 'success'} />
                  </button>
                ))}
                {more}
              </div>
            )}
          </section>
          <section className="card master-detail stack" data-tour="master-detail">
            {party ? (
              <>
                <div className="section-heading">
                  <div>
                    <h2>{party.name}</h2>
                    <p className="muted">
                      {party.phone} {party.email}
                    </p>
                  </div>
                  <div className="button-row">
                    <Button variant="secondary" onClick={() => setEdit(party)}>
                      {t('masters.edit')}
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleting(true)}>
                      {t('masters.delete')}
                    </Button>
                  </div>
                </div>
                <p className="muted">
                  {party.billingAddress}
                  {party.gstin && (
                    <>
                      <br />
                      {t('gstin')}: {party.gstin}
                    </>
                  )}
                </p>
                <div className="balance-banner">
                  <span>{t(party.balance < 0 ? 'masters.pay' : 'masters.receive')}</span>
                  <MoneyText
                    value={Math.abs(party.balance)}
                    tone={party.balance < 0 ? 'danger' : 'success'}
                  />
                </div>
                <div className="button-row">
                  <Button onClick={() => navigate(`invoices/party/${party.id}`)}>
                    {t('masters.saleForParty')}
                  </Button>
                  <Button variant="secondary" onClick={() => setStatement((v) => !v)}>
                    {t('masters.statement')}
                  </Button>
                  {statement && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        navigate(`reports/partyStatement?partyId=${party.id}&from=${from}&to=${to}`)
                      }
                    >
                      {t('masters.printPdf')}
                    </Button>
                  )}
                </div>
                <Tabs
                  value={detailTab}
                  onValueChange={setDetailTab}
                  tabs={[
                    { value: 'transactions', label: t('masters.transactions') },
                    { value: 'prices', label: t('orders.prices') },
                    { value: 'loyalty', label: t('orders.loyalty') },
                  ]}
                />
                {detailTab !== 'transactions' ? (
                  <PartyFeatures
                    key={`${party.id}-${detailTab}`}
                    partyId={party.id}
                    tab={detailTab}
                  />
                ) : (
                  <>
                    <h3>{t(statement ? 'masters.statement' : 'masters.transactions')}</h3>
                    {statement && (
                      <div className="form-grid">
                        <label>
                          {t('masters.from')}
                          <Input
                            type="date"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                          />
                        </label>
                        <label>
                          {t('masters.to')}
                          <Input
                            type="date"
                            value={to}
                            min={from}
                            onChange={(e) => setTo(e.target.value)}
                          />
                        </label>
                      </div>
                    )}
                    {ledger.isError ? (
                      <Button onClick={() => void ledger.refetch()}>{t('retry')}</Button>
                    ) : (
                      <Table
                        data={ledger.data ?? []}
                        empty={
                          <EmptyState
                            title={t('masters.noTransactions')}
                            description={t('masters.ledgerBody')}
                            action={t('masters.saleForParty')}
                            onAction={() => navigate(`invoices/party/${party.id}`)}
                          />
                        }
                        columns={[
                          {
                            accessorKey: 'type',
                            header: t('masters.type'),
                            cell: (c) =>
                              t(`masters.txn.${c.getValue<string>()}`, {
                                defaultValue: c.getValue<string>(),
                              }),
                          },
                          { accessorKey: 'number', header: t('masters.number') },
                          {
                            accessorKey: 'date',
                            header: t('masters.date'),
                            cell: ({ row }) => formatDate(row.original.date, settings),
                          },
                          {
                            accessorKey: 'total',
                            header: t('masters.total'),
                            cell: (c) => <MoneyText value={c.getValue<number>()} />,
                          },
                          {
                            accessorKey: 'balance',
                            header: t('masters.balance'),
                            cell: (c) => (
                              <MoneyText
                                value={c.getValue<number>()}
                                tone={c.getValue<number>() < 0 ? 'danger' : 'success'}
                              />
                            ),
                          },
                        ]}
                      />
                    )}
                  </>
                )}
              </>
            ) : (
              empty
            )}
          </section>
        </div>
      )}
      {edit !== undefined && (
        <PartySheet key={edit?.id ?? 'new'} party={edit} onClose={() => setEdit(undefined)} />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('masters.deleteParty')}
        onConfirm={() => void remove()}
      >
        {t('masters.confirmDelete', { name: party?.name })}
      </ConfirmDialog>
    </div>
  );
}
