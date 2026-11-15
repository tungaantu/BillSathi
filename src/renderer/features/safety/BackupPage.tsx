import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FolderOpen, HardDriveDownload, History, Upload } from 'lucide-react';
import { unwrap } from '../../../shared/types';
import type { BackupPreview, InspectResult } from '../../../shared/safety-api';
import { Button, Dialog, EmptyState, HelpTip, Skeleton, useToast } from '../../components/ui';
import { useApp, useNavigation } from '../../app/state';
import { BackupReminder, useBackupNow, useBackupStatus } from './BackupReminder';
import { formatBytes, formatWhen } from './format';

function PreviewCard({ preview, language }: { preview: BackupPreview; language: string }) {
  const { t } = useTranslation();
  return (
    <div className="card backup-preview">
      <h4>{preview.firms.join(', ') || t('safety.backup.noName')}</h4>
      <dl>
        <dt>{t('safety.backup.madeOn')}</dt>
        <dd>{formatWhen(preview.createdAt, language)}</dd>
        <dt>{t('safety.backup.contains')}</dt>
        <dd>
          {t('safety.backup.counts', {
            parties: preview.counts.parties,
            items: preview.counts.items,
            transactions: preview.counts.transactions,
          })}
        </dd>
        <dt>{t('safety.backup.version')}</dt>
        <dd>{preview.appVersion}</dd>
        <dt>{t('safety.backup.fileSize')}</dt>
        <dd>{formatBytes(preview.size)}</dd>
      </dl>
    </div>
  );
}

export function BackupPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const { error } = useApp();
  const { navigate } = useNavigation();
  const status = useBackupStatus();
  const history = useQuery({
    queryKey: ['backup-history'],
    queryFn: async () => unwrap(await window.api.safety.backup.history()),
  });
  const backup = useBackupNow();
  const [restoring, setRestoring] = useState<BackupPreview | null>(null),
    [rejected, setRejected] = useState<string | null>(null),
    [working, setWorking] = useState(false);

  const show = (result: InspectResult) => {
    if (result.ok) setRestoring(result.preview);
    else setRejected(t(`safety.restore.reject.${result.reason}`));
  };
  async function pick() {
    try {
      const result = unwrap(await window.api.safety.backup.pickRestore());
      if (result) show(result);
    } catch (e) {
      error(e);
    }
  }
  async function restore(path: string) {
    setWorking(true);
    try {
      const result = unwrap(await window.api.safety.backup.restore(path));
      if (!result.ok) {
        setWorking(false);
        setRestoring(null);
        setRejected(t(`safety.restore.reject.${result.reason}`));
      }
      // On success the app restarts by itself.
    } catch (e) {
      setWorking(false);
      error(e);
    }
  }
  const data = status.data;
  const rows = history.data ?? [];
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t('nav.utilities')}</span>
          <h1>{t('nav.backup')}</h1>
          <p className="muted">{t('safety.backup.intro')}</p>
        </div>
      </div>
      <BackupReminder />
      <section className="card stack" data-tour="safety-main">
        <div className="section-heading">
          <div>
            <h3>
              {t('safety.backup.title')} <HelpTip id="safetyBackup" />
            </h3>
            <p className="muted">
              {data?.lastBackupAt
                ? t('safety.backup.last', { when: formatWhen(data.lastBackupAt, i18n.language) })
                : t('safety.backup.never')}
            </p>
            <p className="muted small">
              {t('safety.backup.folder')}: <strong>{data?.folder ?? '…'}</strong>
            </p>
          </div>
        </div>
        <div className="button-row" data-tour="safety-actions">
          <Button disabled={backup.isPending} onClick={() => backup.mutate(false)}>
            <HardDriveDownload size={16} />
            {backup.isPending ? t('safety.backup.working') : t('safety.backup.now')}
          </Button>
          <Button
            variant="secondary"
            disabled={backup.isPending}
            onClick={() => backup.mutate(true)}
          >
            {t('safety.backup.saveAs')}
          </Button>
          <Button variant="secondary" onClick={() => void pick()}>
            <Upload size={16} />
            {t('safety.backup.restoreFromFile')}
          </Button>
          <Button variant="ghost" onClick={() => void window.api.safety.backup.openFolder()}>
            <FolderOpen size={16} />
            {t('safety.backup.openFolder')}
          </Button>
          <Button variant="ghost" onClick={() => navigate('settings/backup')}>
            {t('safety.backup.autoSettings')}
          </Button>
        </div>
      </section>
      <section className="card stack" data-tour="safety-list">
        <h3>
          <History size={18} /> {t('safety.backup.history')}
        </h3>
        {history.isPending ? (
          <Skeleton />
        ) : !rows.length ? (
          <EmptyState
            title={t('safety.backup.emptyTitle')}
            description={t('safety.backup.emptyBody')}
            action={t('safety.backup.now')}
            onAction={() => backup.mutate(false)}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('safety.backup.file')}</th>
                  <th>{t('safety.backup.madeOn')}</th>
                  <th>{t('safety.backup.contains')}</th>
                  <th>{t('safety.backup.fileSize')}</th>
                  <th>{t('sales.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((file) => (
                  <tr key={file.path}>
                    <td>{file.name}</td>
                    <td>{formatWhen(file.preview?.createdAt ?? file.mtime, i18n.language)}</td>
                    <td>
                      {file.preview
                        ? t('safety.backup.counts', file.preview.counts)
                        : t('safety.backup.unreadable')}
                    </td>
                    <td>{formatBytes(file.size)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        disabled={!file.preview}
                        onClick={() => file.preview && setRestoring(file.preview)}
                      >
                        {t('safety.backup.restore')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Dialog
        open={restoring !== null}
        onOpenChange={(v) => !v && !working && setRestoring(null)}
        title={t('safety.restore.title')}
        description={t('safety.restore.body')}
      >
        {restoring && (
          <div className="stack">
            <PreviewCard preview={restoring} language={i18n.language} />
            <div className="info-banner warning-banner" role="alert">
              <AlertTriangle size={20} />
              <div>
                <strong>{t('safety.restore.warnTitle')}</strong>
                <p>{t('safety.restore.warnBody')}</p>
              </div>
            </div>
            <div className="form-actions">
              <Button variant="secondary" disabled={working} onClick={() => setRestoring(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={working}
                onClick={() => void restore(restoring.path)}
              >
                {working ? t('safety.restore.working') : t('safety.restore.confirm')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog
        open={rejected !== null}
        onOpenChange={(v) => !v && setRejected(null)}
        title={t('safety.restore.rejectTitle')}
      >
        <p>{rejected}</p>
        <div className="form-actions">
          <Button
            onClick={() => {
              setRejected(null);
              void client.invalidateQueries({ queryKey: ['backup-history'] });
              toast(t('safety.restore.nothingChanged'));
            }}
          >
            {t('done')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
