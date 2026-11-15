import { useState } from 'react';
import { Search, BookOpen, Keyboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Button, EmptyState, Input, Kbd, replayTour } from '../../components/ui';
const topicIds = Object.keys(i18n.getResourceBundle('en', 'translation') as Record<string, string>)
  .filter((key) => key.startsWith('help.') && key.endsWith('.title'))
  .map((key) => key.slice(5, -6));
export function HelpCentre() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const topics = topicIds.filter((id) =>
    `${t(`help.${id}.title`)} ${t(`help.${id}.body`)}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const shortcuts = [
    ['Ctrl + K / Ctrl + F', 'openSearch'],
    ['Alt + S', 'newSale'],
    ['Alt + P', 'newPurchase'],
    ['Ctrl + S', 'saveForm'],
    ['enter', 'nextField'],
    ['esc', 'closeDialog'],
    ['Ctrl + Del', 'sales.shortcutRemove'],
    ['↑ / ↓', 'sales.shortcutSearch'],
    ['Alt + C', 'calc.title'],
    ['F2', 'pos.shortcut.search'],
    ['F4', 'pos.shortcut.qty'],
    ['F8', 'pos.shortcut.pay'],
    ['F9', 'pos.shortcut.hold'],
    ['Esc', 'pos.shortcut.exit'],
    ['▌▍▌▎▌', 'pos.shortcut.scan'],
  ];
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('nav.help')}</span>
          <h1>{t('helpTitle')}</h1>
          <p className="muted">{t('helpBody')}</p>
        </div>
        <Button variant="secondary" onClick={replayTour}>
          {t('replay')}
        </Button>
      </div>
      <div className="help-layout">
        <div>
          <div className="search-field">
            <Search size={18} />
            <Input
              aria-label={t('helpSearch')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('helpSearch')}
            />
          </div>
          <div className="help-topics">
            {topics.map((id) => (
              <article key={id} className="card help-topic">
                <BookOpen size={19} />
                <div>
                  <h3>{t(`help.${id}.title`)}</h3>
                  <p>{t(`help.${id}.body`)}</p>
                  <div className="help-example">{t(`help.${id}.example`)}</div>
                </div>
              </article>
            ))}
          </div>
          {!topics.length && (
            <EmptyState
              title={t('noResults')}
              description={t('helpBody')}
              action={t('retry')}
              onAction={() => setSearch('')}
            />
          )}
        </div>
        <aside className="card shortcut-card">
          <h3>
            <Keyboard size={20} />
            {t('shortcuts')}
          </h3>
          {shortcuts.map(([key, label]) => (
            <div className="shortcut" key={key}>
              <span>{t(label)}</span>
              <Kbd>{key === 'enter' || key === 'esc' ? t(key) : key}</Kbd>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
