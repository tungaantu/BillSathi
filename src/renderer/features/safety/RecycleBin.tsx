import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { unwrap } from '../../../shared/types';
import { displayDocumentNumber } from '../../../shared/numbering';
import type { RecycleRow } from '../../../shared/safety-api';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  HelpTip,
  InfoBanner,
  MoneyText,
  Select,
  Skeleton,
  useToast,
} from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { formatDay } from './format';

export function RecycleBin() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const { firm, error } = useApp();
  const { navigate } = useNavigation();
  const firmId = firm!.id;
  const [type, setType] = useState(''),
    [forever, setForever] = useState<RecycleRow | 'all' | null>(null);
  const query = useQuery({
    queryKey: ['recycle', firmId],
    queryFn: async () => unwrap(await window.api.safety.recycle.list(firmId)),
  });
  const refresh = async () => {
    await client.invalidateQueries();
  };
  async function restore(row: RecycleRow) {
    try {
      unwrap(await window.api.safety.recycle.restore(firmId, row.id));
      await refresh();
      toast(t('safety.recycle.restored'));
    } catch (e) {
      error(e);
    }
  }
  async function purge() {
    const target = forever;
    setForever(null);
    try {
      if (target === 'all') unwrap(await window.api.safety.recycle.empty(firmId));
      else if (target) unwrap(await window.api.safety.recycle.purge(firmId, target.id));
      await refresh();
      toast(t('safety.recycle.gone'));
    } catch (e) {
      error(e);
    }
  }
  const all = query.data ?? [];
  const types = [...new Set(all.map((r) => r.type))];
  const rows = all.filter((r) => !type || r.type === type);
  return (
    <div className="stack">
      <div className="page-heading" data-tour="safety-head">
        <div>
          <span className="eyebrow">{t('nav.utilities')}</span>
          <h1>
            {t('nav.recycleBin')} <HelpTip id="safetyRecycle" />
          </h1>
          <p className="muted">{t('safety.recycle.intro')}</p>
        </div>
        {all.length > 0 && (
          <Button variant="danger" onClick={() => setForever('all')}>
            <Trash2 size={16} />
            {t('safety.recycle.empty')}
          </Button>
        )}
      </div>
      <InfoBanner id="recycle-30">{t('safety.recycle.banner')}</InfoBanner>
      <section className="card stack" data-tour="safety-main">
        {query.isPending ? (
          <Skeleton />
        ) : !all.length ? (
          <EmptyState
            title={t('safety.recycle.emptyTitle')}
            description={t('safety.recycle.emptyBody')}
            action={t('safety.recycle.goInvoices')}
            onAction={() => navigate('invoices')}
          />
        ) : (
          <>
            <div className="button-row" data-tour="safety-actions">
              <div className="setting-control">
                <Select
                  label={t('safety.recycle.type')}
                  value={type}
                  onChange={setType}
                  options={[
                    { value: '', label: t('sales.all') },
                    ...types.map((v) => ({ value: v, label: t(`sales.type.${v}`) })),
                  ]}
                />
              </div>
            </div>
            <div className="table-scroll" data-tour="safety-list">
              <table>
                <thead>
                  <tr>
                    {['type', 'number', 'party', 'amount', 'deletedOn', 'daysLeft', 'actions'].map(
                      (k) => (
                        <th key={k}>{t(`safety.recycle.col.${k}`)}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{t(`sales.type.${r.type}`)}</td>
                      <td>{displayDocumentNumber({ ...r, firmId })}</td>
                      <td>{r.partyName || t('sales.walkIn')}</td>
                      <td>
                        <MoneyText value={r.total} />
                      </td>
                      <td>{r.deletedAt ? formatDay(r.deletedAt, i18n.language) : ''}</td>
                      <td>{t('safety.recycle.days', { count: r.daysLeft })}</td>
                      <td>
                        <div className="button-row">
                          <Button variant="secondary" onClick={() => void restore(r)}>
                            {t('sales.restore')}
                          </Button>
                          <Button variant="ghost" onClick={() => setForever(r)}>
                            {t('safety.recycle.forever')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <ConfirmDialog
        open={forever !== null}
        onOpenChange={(v) => !v && setForever(null)}
        title={t('safety.recycle.confirmTitle')}
        onConfirm={() => void purge()}
      >
        {forever === 'all' ? t('safety.recycle.confirmAll') : t('safety.recycle.confirmOne')}
      </ConfirmDialog>
    </div>
  );
}
