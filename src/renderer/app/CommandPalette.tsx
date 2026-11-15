import { useState } from 'react';
import { Search, ArrowUpRight, ShoppingBag, ShoppingCart, Users, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog, Input, Kbd } from '../components/ui';
import { useApp, useNavigation } from './state';
import { unwrap } from '../../shared/types';
import { routes } from './routes';
export function CommandPalette() {
  const { t } = useTranslation();
  const { palette, setPalette, navigate } = useNavigation();
  const { firm } = useApp();
  const parties = useQuery({
    queryKey: ['parties', firm?.id],
    queryFn: async () => unwrap(await window.api.masters.parties(firm!.id)),
    enabled: palette && Boolean(firm),
  });
  const items = useQuery({
    queryKey: ['items', firm?.id],
    queryFn: async () => unwrap(await window.api.masters.items(firm!.id)),
    enabled: palette && Boolean(firm),
  });
  const [search, setSearch] = useState(''),
    [active, setActive] = useState(0);
  const actions = [
    { id: 'newSale', route: 'invoices/new', icon: ShoppingBag, label: t('newSale') },
    { id: 'newPurchase', route: 'bills', icon: ShoppingCart, label: t('newPurchase') },
    { id: 'newParty', route: 'parties/new', icon: Users, label: t('masters.newParty') },
    { id: 'newItem', route: 'items/new', icon: Package, label: t('masters.newItem') },
    ...(search.trim()
      ? (parties.data ?? []).map((p) => ({
          id: `party-${p.id}`,
          route: `parties/${p.id}`,
          icon: Users,
          label: p.name,
        }))
      : []),
    ...(search.trim()
      ? (items.data ?? []).map((i) => ({
          id: `item-${i.id}`,
          route: `items/${i.id}`,
          icon: Package,
          label: i.name,
        }))
      : []),
    ...routes.map((route) => ({ ...route, route: route.id, label: t(`nav.${route.id}`) })),
  ];
  const results = actions.filter((action) =>
    `${action.label} ${action.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <Dialog
      open={palette}
      onOpenChange={(value) => {
        setPalette(value);
        setSearch('');
        setActive(0);
      }}
      title={t('searchScreen')}
      className="command-dialog"
    >
      <div className="search-field">
        <Search size={20} />
        <Input
          autoFocus
          aria-label={t('search')}
          role="combobox"
          aria-expanded="true"
          aria-controls="commands"
          aria-activedescendant={results[active] ? `command-${active}` : undefined}
          value={search}
          placeholder={t('search')}
          onChange={(e) => {
            setSearch(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
              e.preventDefault();
              setActive((n) =>
                Math.max(0, Math.min(results.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))),
              );
            }
            if (e.key === 'Enter' && results[active]) {
              e.preventDefault();
              navigate(results[active].route);
              setSearch('');
              setActive(0);
            }
          }}
        />
      </div>
      <div id="commands" role="listbox" aria-label={t('searchScreen')} className="command-results">
        {results.map((action, index) => (
          <button
            type="button"
            role="option"
            aria-selected={index === active}
            id={`command-${index}`}
            className={`command-row ${index === active ? 'active' : ''}`}
            key={action.id}
            onClick={() => {
              navigate(action.route);
              setSearch('');
              setActive(0);
            }}
          >
            <action.icon size={18} />
            <span>{action.label}</span>
            <ArrowUpRight size={15} />
          </button>
        ))}
        {!results.length && <p className="muted">{t('noResults')}</p>}
      </div>
      <div className="command-footer">
        <Kbd>↑ ↓</Kbd>
        <Kbd>{t('enter')}</Kbd>
        <Kbd>{t('esc')}</Kbd>
      </div>
    </Dialog>
  );
}
