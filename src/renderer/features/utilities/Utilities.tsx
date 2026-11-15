import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  importFields,
  type ImportKind,
  type ImportPreview,
  type ImportSheet,
} from '../../../shared/master-import';
import { unwrap } from '../../../shared/types';
import { Button, EmptyState, HelpTip, Select, Table, Tabs, useToast } from '../../components/ui';
import { useMasters } from '../masters/common';
import { ComplianceUtilities } from '../compliance/ComplianceUtilities';
import { useNavigation } from '../../app/state';
import './utilities.css';
export function Utilities() {
  const { t } = useTranslation(),
    toast = useToast(),
    { firmId, invalidate, error } = useMasters(),
    { navigate } = useNavigation();
  const [kind, setKind] = useState<ImportKind>('items'),
    [sheet, setSheet] = useState<ImportSheet | null>(null),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [result, setResult] = useState<{ imported: number; skipped: number } | null>(null),
    [busy, setBusy] = useState(false);
  async function read() {
    setBusy(true);
    try {
      const data = unwrap(await window.api.masters.readImport());
      if (!data) return;
      setSheet(data);
      setMapping(
        Object.fromEntries(
          importFields[kind].map((f) => [
            f,
            data.headers.find((h) => h.toLowerCase() === f.toLowerCase()) ?? '',
          ]),
        ),
      );
      setPreview(null);
      setResult(null);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!sheet) return;
    setBusy(true);
    try {
      setPreview(unwrap(await window.api.masters.preview(firmId, kind, sheet, mapping)));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    if (!sheet) return;
    setBusy(true);
    try {
      const done = unwrap(await window.api.masters.import(firmId, kind, sheet, mapping));
      setResult(done);
      setSheet(null);
      setPreview(null);
      await invalidate();
      toast(t('masters.importDone', done));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function exportFile(sample = false) {
    try {
      if (unwrap(await window.api.masters.export(firmId, kind, sample)))
        toast(t('masters.fileSaved'));
    } catch (e) {
      error(e);
    }
  }
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <h1>{t('nav.utilities')}</h1>
          <p className="muted">{t('masters.importBody')}</p>
        </div>
      </div>
      <Tabs
        value={kind}
        onValueChange={(v) => {
          setKind(v as ImportKind);
          setSheet(null);
          setPreview(null);
          setResult(null);
        }}
        tabs={['items', 'parties'].map((value) => ({ value, label: t(`nav.${value}`) }))}
      />
      <section className="card master-detail stack">
        <div className="button-row">
          <Button disabled={busy} onClick={() => void read()}>
            {t('masters.chooseFile')}
          </Button>
          <Button variant="secondary" onClick={() => void exportFile(true)}>
            {t('masters.sample')}
          </Button>
          <Button variant="secondary" onClick={() => void exportFile()}>
            {t('masters.export')}
          </Button>
        </div>
        <p className="muted">{t('masters.importRules')}</p>
        {result && <div className="info-banner">{t('masters.importDone', result)}</div>}
        {!sheet && !result && (
          <EmptyState
            title={t('masters.importTitle')}
            description={t('masters.importBody')}
            action={t('masters.chooseFile')}
            onAction={() => void read()}
          />
        )}
        {sheet && !preview && (
          <>
            <h3>{t('masters.mapping')}</h3>
            <p className="muted">{t('masters.mappingBody', { count: sheet.rows.length })}</p>
            <div className="form-grid">
              {importFields[kind].map((field) => (
                <label className="field" key={field}>
                  <span className="field-label">
                    {t(`masters.${field}`)}
                    <HelpTip id={`master-${field}`} />
                  </span>
                  <Select
                    label={t(`masters.${field}`)}
                    value={mapping[field] ?? ''}
                    onChange={(v) => {
                      setMapping((p) => ({ ...p, [field]: v }));
                      setPreview(null);
                    }}
                    options={[
                      { value: '', label: t('masters.skipColumn') },
                      ...sheet.headers.map((value) => ({ value, label: value })),
                    ]}
                  />
                </label>
              ))}
            </div>
            <Button disabled={busy || !mapping.name} onClick={() => void check()}>
              {t('masters.preview')}
            </Button>
          </>
        )}
        {preview && (
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              {t('back')}
            </Button>
            <h3>
              {t('masters.previewSummary', { valid: preview.valid, invalid: preview.invalid })}
            </h3>
            <Table
              data={preview.rows}
              empty={<p>{t('noResults')}</p>}
              columns={[
                { accessorKey: 'row', header: t('masters.row') },
                { accessorKey: 'name', header: t('masters.name') },
                {
                  id: 'validation',
                  header: t('masters.validation'),
                  cell: (c) =>
                    c.row.original.errors.length ? (
                      <span className="danger">
                        {c.row.original.errors
                          .map((field) => t('masters.checkField', { field: t(`masters.${field}`) }))
                          .join(' · ')}
                      </span>
                    ) : (
                      <span className="success">{t('masters.ready')}</span>
                    ),
                },
              ]}
            />
            <Button disabled={busy || !preview.valid} onClick={() => void load()}>
              {t('masters.importValid', { count: preview.valid })}
            </Button>
          </>
        )}
      </section>
      <section className="card stack tool-links" data-tour="utilities-tools">
        <h2>{t('utilities.more')}</h2>
        <div className="button-row">
          {['closeYear', 'bulkItems', 'barcodeLabels', 'verifyData', 'serialLookup'].map((id) => (
            <Button key={id} variant="secondary" onClick={() => navigate(id)}>
              {t(`nav.${id}`)}
            </Button>
          ))}
        </div>
      </section>
      <ComplianceUtilities />
    </div>
  );
}
