import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './primitives';

/**
 * Long lists render the first `step` rows and a "Show more" button, so a business with
 * thousands of bills or items still opens its lists instantly. Totals use the full list.
 */
export function useShowMore<T>(rows: T[], step = 200): { visible: T[]; more: ReactNode } {
  const { t } = useTranslation();
  const [limit, setLimit] = useState(step);
  const left = rows.length - limit;
  return {
    visible: left > 0 ? rows.slice(0, limit) : rows,
    more:
      left > 0 ? (
        <div className="show-more">
          <Button variant="secondary" onClick={() => setLimit((n) => n + step)}>
            {t('list.showMore', { count: Math.min(step, left), left })}
          </Button>
        </div>
      ) : null,
  };
}
