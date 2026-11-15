import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge, EmptyState, Field, HelpTip, Input } from '../../components/ui';
import { useNavigation } from '../../app/state';
import { unwrap } from '../../../shared/types';
import { formatDate } from '../../../shared/dates';
import { txnLink } from '../../../shared/reports';
import { displayDocumentNumber } from '../../../shared/numbering';
import { useSales } from '../sales/common';

export function SerialLookup() {
  const { t } = useTranslation(),
    { firmId, settings } = useSales(),
    { navigate } = useNavigation();
  const [query, setQuery] = useState('');
  const results = useQuery({
    queryKey: ['serialHistory', firmId, query.trim()],
    queryFn: async () => unwrap(await window.api.inventory.serialHistory(firmId, query.trim())),
    enabled: query.trim().length >= 2,
  });
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>{t('nav.serialLookup')}</h1>
          <p className="muted">
            {t('inventory.serial.intro')} <HelpTip id="inventory-serial" />
          </p>
        </div>
      </div>
      <section className="card" data-tour="inventory-new">
        <Field id="serial-search" label={t('inventory.serial.search')} help="inventory-serial">
          <Input
            id="serial-search"
            data-scan
            autoFocus
            maxLength={60}
            placeholder={t('inventory.serial.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
      </section>
      <section className="stack" data-tour="inventory-list">
        {!results.data?.length ? (
          <div className="card">
            <EmptyState
              title={t(
                query.trim().length >= 2 ? 'inventory.serial.none' : 'inventory.serial.start',
              )}
              description={t('inventory.serial.emptyBody')}
              action={t('nav.items')}
              onAction={() => navigate('items')}
            />
          </div>
        ) : (
          results.data.map((r) => (
            <article className="card stack" key={r.serial}>
              <div className="section-heading">
                <h2>
                  {r.serial} · {r.item}
                </h2>
                <Badge tone={r.inStock ? 'success' : ''}>
                  {t(r.inStock ? 'inventory.serial.inStock' : 'inventory.serial.sold')}
                </Badge>
              </div>
              <ol className="serial-events" data-tour="inventory-actions">
                {r.events.map((e, i) => (
                  <li key={i}>
                    <span>{formatDate(e.date, settings)}</span>
                    <button
                      className="link"
                      onClick={() => {
                        const link = txnLink(e.type, e.txnId);
                        if (link) navigate(link);
                      }}
                    >
                      {t(`reports.type.${e.type}`)}{' '}
                      {displayDocumentNumber({
                        firmId,
                        type: e.type,
                        prefix: e.prefix,
                        number: e.number,
                      })}
                    </button>
                    <span>{e.party}</span>
                    <span className={e.direction > 0 ? 'in' : 'out'}>
                      {t(e.direction > 0 ? 'inventory.serial.in' : 'inventory.serial.out')}
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
