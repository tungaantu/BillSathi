import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { useTranslation } from 'react-i18next';
import { unwrap, type Firm, type SettingValue, type Settings } from '../../shared/types';
import { useToast } from '../components/ui/Toast';
import { APP_NAME } from '../../shared/constants';
const initialRoute = location.hash.slice(1) || 'home';
export const useNavigation = create<{
  route: string;
  collapsed: boolean;
  palette: boolean;
  navigate: (route: string) => void;
  toggle: () => void;
  setPalette: (v: boolean) => void;
}>((set) => ({
  route: initialRoute,
  collapsed: false,
  palette: false,
  navigate: (route) => {
    location.hash = route;
    set({ route, palette: false });
  },
  toggle: () => set((state) => ({ collapsed: !state.collapsed })),
  setPalette: (palette) => set({ palette }),
}));
window.addEventListener('hashchange', () =>
  useNavigation.setState({ route: location.hash.slice(1) || 'home' }),
);
interface AppState {
  firms: Firm[];
  firm?: Firm;
  settings: Settings;
  loading: boolean;
  failed: boolean;
  selectFirm: (id: number) => void;
  refresh: () => Promise<void>;
  saveSetting: (key: string, value: SettingValue, silent?: boolean) => Promise<void>;
  error: (error: unknown) => void;
}
const Context = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const [firmId, setFirmId] = useState(() => Number(localStorage.getItem('activeFirm')) || 0);
  const firmsQuery = useQuery({
    queryKey: ['firms'],
    queryFn: async () => unwrap(await window.api.firm.list()),
  });
  const firms = firmsQuery.data ?? [];
  const firm = firms.find((f) => f.id === firmId) ?? firms[0];
  const settingsQuery = useQuery({
    queryKey: ['settings', firm?.id],
    queryFn: async () => unwrap(await window.api.settings.get(firm!.id)),
    enabled: Boolean(firm),
  });
  const settings = settingsQuery.data ?? {};
  useEffect(() => {
    document.title = firm ? `${firm.name} · ${APP_NAME}` : APP_NAME;
  }, [firm]);
  useEffect(() => {
    document.documentElement.dataset.theme = String(settings.theme ?? 'light');
    document.documentElement.lang = String(settings.language ?? 'en');
    document.documentElement.style.setProperty(
      '--workspace-zoom',
      String(Number(settings.zoom ?? 100) / 100),
    );
    void i18n.changeLanguage(String(settings.language ?? 'en'));
  }, [settings.theme, settings.language, settings.zoom, i18n]);
  const error = (error: unknown) => {
    const code = error instanceof Error ? error.message : 'error';
    toast(
      t(
        ['validation', 'storage'].includes(code)
          ? code
          : [
                'duplicate',
                'negativeStock',
                'allocation',
                'linked',
                'overpayment',
                'phone',
                'salesValidation',
                'serials',
                'closedYear',
                'backupFirst',
              ].includes(code)
            ? `sales.error.${code}`
            : code === 'notFound'
              ? 'notFoundError'
              : 'error',
      ),
      { error: true },
    );
  };
  const mutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: SettingValue }) =>
      unwrap(await window.api.settings.set(firm!.id, key, value)),
    onSuccess: (data) => client.setQueryData(['settings', firm?.id], data),
  });
  async function saveSettingNow(key: string, value: SettingValue, silent = false) {
    try {
      await mutation.mutateAsync({ key, value });
      if (!silent) toast(t('saved'));
    } catch (e) {
      error(e);
      throw e;
    }
  }
  // Stable identity: screens list saveSetting in effect deps; a new function per render made
  // "save → re-render → effect → save" loops (React error #185 on report pages).
  const saveRef = useRef(saveSettingNow);
  useEffect(() => {
    saveRef.current = saveSettingNow;
  });
  const saveSetting = useCallback(
    (key: string, value: SettingValue, silent?: boolean) => saveRef.current(key, value, silent),
    [],
  );
  const refresh = async () => {
    await client.invalidateQueries();
  };
  return (
    <Context.Provider
      value={{
        firms,
        firm,
        settings,
        loading: firmsQuery.isPending || Boolean(firm && settingsQuery.isPending),
        failed: firmsQuery.isError || settingsQuery.isError,
        selectFirm: (id) => {
          setFirmId(id);
          localStorage.setItem('activeFirm', String(id));
        },
        refresh,
        saveSetting,
        error,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp(): AppState {
  const context = useContext(Context);
  if (!context) throw new Error('AppProvider required');
  return context;
}
