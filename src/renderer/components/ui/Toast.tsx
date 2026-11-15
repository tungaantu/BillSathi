import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, X, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './primitives';
type Notice = { id: number; text: string; error?: boolean; undo?: () => void };
const Context = createContext<
  (text: string, options?: { error?: boolean; undo?: () => void }) => void
>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [notices, setNotices] = useState<Notice[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    for (const notice of notices.slice(0, 3)) {
      if (notice.error || timers.current.has(notice.id)) continue;
      timers.current.set(
        notice.id,
        setTimeout(() => {
          timers.current.delete(notice.id);
          setNotices((rows) => rows.filter((row) => row.id !== notice.id));
        }, 4000),
      );
    }
  }, [notices]);
  const notify = useCallback(
    (text: string, options: { error?: boolean; undo?: () => void } = {}) => {
      const id = ++counter.current;
      setNotices((rows) =>
        rows.some((row) => row.text === text) ? rows : [...rows, { id, text, ...options }],
      );
    },
    [],
  );
  return (
    <Context.Provider value={notify}>
      {children}
      <div className="toasts" aria-live="polite">
        {notices.slice(0, 3).map((notice) => (
          <div
            className={`toast ${notice.error ? 'error' : ''}`}
            role={notice.error ? 'alert' : 'status'}
            key={notice.id}
          >
            {notice.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            <span>{notice.text}</span>
            {notice.undo && (
              <button
                onClick={() => {
                  notice.undo?.();
                  setNotices((rows) => rows.filter((row) => row.id !== notice.id));
                }}
              >
                {t('undo')}
              </button>
            )}
            <IconButton
              label={t('close')}
              onClick={() => setNotices((rows) => rows.filter((row) => row.id !== notice.id))}
            >
              <X size={16} />
            </IconButton>
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}
export const useToast = () => useContext(Context);
