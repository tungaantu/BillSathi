import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { unwrap } from '../../../shared/types';
import type { BackupConfig } from '../../../shared/backup';
import { Button, HelpTip, Select, Switch, useToast } from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { useBackupStatus } from './BackupReminder';

const KEEP = [5, 10, 20, 30, 50];
/** Settings → Backup: automatic backups, where they go and how many to keep. */
export function BackupSettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const { settings, saveSetting, error } = useApp();
  const { navigate } = useNavigation();
  const status = useBackupStatus();
  const data = status.data;
  async function update(patch: Partial<BackupConfig>) {
    try {
      client.setQueryData(
        ['backup-status'],
        unwrap(await window.api.safety.backup.setConfig(patch)),
      );
      toast(t('saved'));
    } catch (e) {
      error(e);
    }
  }
  async function chooseFolder() {
    try {
      if (unwrap(await window.api.safety.backup.chooseFolder()))
        await client.invalidateQueries({ queryKey: ['backup-status'] });
    } catch (e) {
      error(e);
    }
  }
  if (!data) return null;
  const row = (label: string, help: string, control: ReactNode) => (
    <div className="setting-row">
      <div className="field-label">
        <span>{label}</span>
        <HelpTip id={help} />
      </div>
      {control}
    </div>
  );
  return (
    <section className="card settings-card" data-tour="safety-main">
      <h3>{t('safety.backupSettings.title')}</h3>
      {row(
        t('safety.backupSettings.auto'),
        'safetyAutoBackup',
        <Switch
          label={t('safety.backupSettings.auto')}
          checked={data.config.auto}
          onCheckedChange={(auto) => void update({ auto })}
        />,
      )}
      {row(
        t('safety.backupSettings.frequency'),
        'safetyFrequency',
        <div className="setting-control">
          <Select
            label={t('safety.backupSettings.frequency')}
            value={data.config.frequency}
            options={[
              { value: 'daily', label: t('safety.backupSettings.daily') },
              { value: 'close', label: t('safety.backupSettings.close') },
            ]}
            onChange={(frequency) => void update({ frequency: frequency as 'daily' | 'close' })}
          />
        </div>,
      )}
      {row(
        t('safety.backupSettings.folder'),
        'safetyFolder',
        <div className="button-row">
          <span className="muted folder-path" title={data.folder}>
            {data.folder}
          </span>
          <Button variant="secondary" onClick={() => void chooseFolder()}>
            {t('safety.backupSettings.change')}
          </Button>
          {data.config.folder && (
            <Button variant="ghost" onClick={() => void update({ folder: null })}>
              {t('safety.backupSettings.reset')}
            </Button>
          )}
        </div>,
      )}
      {row(
        t('safety.backupSettings.keep'),
        'safetyKeep',
        <div className="setting-control">
          <Select
            label={t('safety.backupSettings.keep')}
            value={String(data.config.keep)}
            options={[...new Set([...KEEP, data.config.keep])]
              .sort((a, b) => a - b)
              .map((n) => ({
                value: String(n),
                label: t('safety.backupSettings.last', { count: n }),
              }))}
            onChange={(keep) => void update({ keep: Number(keep) })}
          />
        </div>,
      )}
      {row(
        t('setting.backupReminder'),
        'setting-backupReminder',
        <Switch
          label={t('setting.backupReminder')}
          checked={settings.backupReminder !== false}
          onCheckedChange={(value) => void saveSetting('backupReminder', value).catch(() => {})}
        />,
      )}
      <div className="setting-row">
        <p className="muted">{t('safety.backupSettings.note')}</p>
        <Button variant="secondary" onClick={() => navigate('backup')}>
          {t('nav.backup')}
        </Button>
      </div>
    </section>
  );
}
