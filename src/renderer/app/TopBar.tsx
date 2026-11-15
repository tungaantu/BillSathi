import {
  Plus,
  Sun,
  Moon,
  Search,
  ShoppingBag,
  ShoppingCart,
  CircleHelp,
  RotateCcw,
  Building2,
  Calculator as CalculatorIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Calculator } from '../features/utilities/Calculator';
import { useTranslation } from 'react-i18next';
import { Button, DropdownMenu, IconButton, Kbd, replayTour, Select } from '../components/ui';
import { useApp, useNavigation } from './state';
export function TopBar() {
  const [calc, setCalc] = useState(false);
  useEffect(() => {
    const open = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setCalc(true);
      }
    };
    window.addEventListener('keydown', open);
    return () => window.removeEventListener('keydown', open);
  }, []);
  const { t } = useTranslation();
  const { firm, firms, settings, saveSetting, selectFirm } = useApp();
  const { navigate, setPalette } = useNavigation();
  return (
    <header className="topbar">
      <div className="firm-picker">
        <Building2 size={19} />
        <Select
          label={t('firm')}
          value={String(firm!.id)}
          onChange={(value) => selectFirm(Number(value))}
          options={firms.map((firm) => ({ value: String(firm.id), label: firm.name }))}
        />
      </div>
      <button className="search-trigger" data-tour="search" onClick={() => setPalette(true)}>
        <Search size={17} />
        <span>{t('search')}</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <div className="topbar-actions">
        <Button onClick={() => navigate('invoices/new')}>
          <Plus size={17} />
          {t('newSale')}
        </Button>
        <Button variant="secondary" onClick={() => navigate('bills/new')}>
          <Plus size={17} />
          {t('newPurchase')}
        </Button>
        <DropdownMenu
          trigger={
            <IconButton label={t('quickCreate')}>
              <Plus size={20} />
            </IconButton>
          }
          items={[
            {
              label: t('newSale'),
              onSelect: () => navigate('invoices/new'),
              icon: <ShoppingBag size={16} />,
            },
            {
              label: t('newPurchase'),
              onSelect: () => navigate('bills/new'),
              icon: <ShoppingCart size={16} />,
            },
            { label: t('item'), onSelect: () => navigate('items') },
            { label: t('party'), onSelect: () => navigate('parties') },
            {
              label: `${t('calc.title')} (Alt+C)`,
              onSelect: () => setCalc(true),
              icon: <CalculatorIcon size={16} />,
            },
          ]}
        />
        {calc && <Calculator onClose={() => setCalc(false)} />}
        <span className="topbar-divider" />
        <IconButton
          label={t('theme')}
          onClick={() =>
            void saveSetting('theme', settings.theme === 'dark' ? 'light' : 'dark', true).catch(
              () => {},
            )
          }
        >
          {settings.theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </IconButton>
        <button
          className="language-toggle"
          aria-label={t('language')}
          onClick={() =>
            void saveSetting('language', settings.language === 'hi' ? 'en' : 'hi', true).catch(
              () => {},
            )
          }
        >
          {t('toggleLanguageLabel')}
        </button>
        <DropdownMenu
          trigger={
            <IconButton label={t('help')}>
              <CircleHelp size={20} />
            </IconButton>
          }
          items={[
            {
              label: t('nav.help'),
              icon: <CircleHelp size={16} />,
              onSelect: () => navigate('help'),
            },
            { label: t('replay'), icon: <RotateCcw size={16} />, onSelect: replayTour },
          ]}
        />
      </div>
    </header>
  );
}
