import { ChevronDown, ChevronsLeft, ChevronsRight, Leaf, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '../../shared/constants';
import { groups, routes } from './routes';
import { useApp, useNavigation } from './state';
import { IconButton } from '../components/ui';
export function Sidebar() {
  const { t } = useTranslation();
  const { collapsed, toggle, route, navigate } = useNavigation();
  const { settings } = useApp();
  const [open, setOpen] = useState<string[]>(['sale']);
  const link = (id: string, Icon: typeof Leaf, nested = false) => (
    <button
      key={id}
      title={collapsed ? t(`nav.${id}`) : undefined}
      className={`nav-link ${nested ? 'nested' : ''} ${route === id || (id === 'settings' && (route.startsWith('settings/') || route === 'profile')) ? 'active' : ''}`}
      onClick={() => navigate(id)}
    >
      {!nested && <Icon size={20} />}
      <span>{t(`nav.${id}`)}</span>
      {nested && route === id && <span className="nav-active-dot" />}
    </button>
  );
  return (
    <aside data-tour="navigation" className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        <span className="brand-symbol">
          <Leaf size={22} />
        </span>
        {!collapsed && <strong>{APP_NAME}</strong>}
      </div>
      <div className="sidebar-scroll">
        <p className="nav-label">{t('workspace')}</p>
        <nav aria-label={t('workspace')}>
          {routes
            .filter((r) => ['home', 'parties', 'items'].includes(r.id))
            .map((r) => link(r.id, r.icon))}
          {groups.map((group) => (
            <div className="nav-group" key={group.id}>
              <button
                className={`nav-link ${routes.some((r) => r.group === group.id && r.id === route) ? 'group-active' : ''}`}
                title={collapsed ? t(`nav.${group.id}`) : undefined}
                aria-expanded={open.includes(group.id)}
                onClick={() => {
                  if (collapsed) toggle();
                  setOpen((ids) =>
                    ids.includes(group.id)
                      ? ids.filter((id) => id !== group.id)
                      : [...ids, group.id],
                  );
                }}
              >
                <group.icon size={20} />
                <span>{t(`nav.${group.id}`)}</span>
                <ChevronDown size={15} className={open.includes(group.id) ? 'rotate' : ''} />
              </button>
              {!collapsed && open.includes(group.id) && (
                <div className="nav-children">
                  {routes
                    .filter((r) => r.group === group.id && (!r.setting || settings[r.setting]))
                    .map((r) => link(r.id, r.icon, true))}
                </div>
              )}
            </div>
          ))}
          {link('reports', routes.find((r) => r.id === 'reports')!.icon)}
          <p className="nav-label manage-label">{t('manage')}</p>
          {routes
            .filter((r) =>
              [
                'backup',
                'recycleBin',
                'auditTrail',
                'verifyData',
                'utilities',
                'settings',
                'help',
              ].includes(r.id),
            )
            .map((r) => link(r.id, r.icon))}
        </nav>
      </div>
      <div className="sidebar-footer">
        {!collapsed && (
          <span>
            <ShieldCheck size={15} />
            {t('connected')}
          </span>
        )}
        <IconButton label={t(collapsed ? 'expand' : 'collapse')} onClick={toggle}>
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </IconButton>
      </div>
    </aside>
  );
}
