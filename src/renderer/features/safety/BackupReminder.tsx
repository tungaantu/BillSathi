import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDriveDownload, X } from 'lucide-react';
import { unwrap } from '../../../shared/types';
import { Button, IconButton, useToast } from '../../components/ui';
import { useApp } from '../../app/state';

const KEY = 'backupReminderHidden';
const hiddenThisSession = () => {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
export function useBackupStatus() {
  return useQuery({
    queryKey: ['backup-status'],
    queryFn: async () => unwrap(await window.api.safety.backup.status()),
  });
}
/** Runs a backup into the configured folder and refreshes everything that shows backup state. */
export function useBackupNow() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const { error } = useApp();
  return useMutation({
    mutationFn: async (saveAs: boolean) => unwrap(await window.api.safety.backup.run(saveAs)),
    onSuccess: async (result) => {
      if (result) toast(t('safety.backup.done'));
      await client.invalidateQueries({ queryKey: ['backup-status'] });
      await client.invalidateQueries({ queryKey: ['backup-history'] });
      await client.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: error,
  });
}
/** Non-blocking nudge shown on the Dashboard and Backup screen after 7 days without a backup. */
export function BackupReminder() {
  const { t } = useTranslation();
  const { settings } = useApp();
  const status = useBackupStatus();
  const backup = useBackupNow();
  const [hidden, setHidden] = useState(hiddenThisSession);
  const data = status.data;
  if (hidden || !data?.reminderDue || settings.backupReminder === false) return null;
  return (
    <div className="info-banner backup-reminder" role="status">
      <HardDriveDownload size={20} />
      <div>
        <strong>
          {data.daysSince === null
            ? t('safety.reminder.never')
            : t('safety.reminder.ago', { count: data.daysSince })}
        </strong>
        <p>{t('safety.reminder.body')}</p>
        <Button disabled={backup.isPending} onClick={() => backup.mutate(false)}>
          {t('safety.backup.now')}
        </Button>
      </div>
      <IconButton
        label={t('close')}
        onClick={() => {
          try {
            sessionStorage.setItem(KEY, '1');
          } catch {
            /* storage unavailable: just hide for now */
          }
          setHidden(true);
        }}
      >
        <X size={16} />
      </IconButton>
    </div>
  );
}
