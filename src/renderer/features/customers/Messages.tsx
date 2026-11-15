import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, HelpTip, useToast } from '../../components/ui';
import { unwrap } from '../../../shared/types';
import { useApp } from '../../app/state';
export function MessageDialog({
  value,
  onClose,
  next,
  position,
}: {
  value: { phone: string; message: string };
  onClose: () => void;
  next?: () => void;
  position?: string;
}) {
  const { t } = useTranslation(),
    { error } = useApp(),
    toast = useToast();
  const [message, setMessage] = useState(value.message);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={t('orders.message')}
    >
      <p>
        {position} <HelpTip id="orders-messages" />
      </p>
      <textarea
        className="input"
        rows={7}
        aria-label={t('orders.message')}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="button-row">
        <Button
          disabled={!value.phone}
          onClick={() =>
            void window.api.customers.whatsapp(value.phone, message).then(unwrap).catch(error)
          }
        >
          {t('orders.whatsapp')}
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            void navigator.clipboard
              .writeText(message)
              .then(() => toast(t('orders.copied')))
              .catch(error)
          }
        >
          {t('orders.copy')}
        </Button>
        {next && (
          <Button variant="secondary" onClick={next}>
            {t('orders.nextMessage')}
          </Button>
        )}
      </div>
      {!value.phone && <p className="muted">{t('masters.noPhone')}</p>}
    </Dialog>
  );
}
