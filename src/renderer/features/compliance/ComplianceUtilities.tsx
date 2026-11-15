import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, HelpTip } from '../../components/ui';
import { EwayBulk } from './EwayBulk';
import { TallyExport } from './TallyExport';
import './compliance.css';

/** Utilities page section: bulk e-way bill JSON and Tally export. */
export function ComplianceUtilities() {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<'eway' | 'tally' | null>(null);
  return (
    <section className="card master-detail stack" data-tour="compliance-utilities">
      <div>
        <h2>{t('compliance.title')}</h2>
        <p className="muted">{t('compliance.intro')}</p>
      </div>
      <div className="button-row">
        <Button variant="secondary" onClick={() => setDialog('eway')}>
          {t('compliance.bulk.title')}
        </Button>
        <HelpTip id="compliance-eway-overview" />
        <Button variant="secondary" onClick={() => setDialog('tally')}>
          {t('compliance.tally.title')}
        </Button>
        <HelpTip id="compliance-tally-overview" />
      </div>
      <EwayBulk open={dialog === 'eway'} onOpenChange={(v) => !v && setDialog(null)} />
      <TallyExport open={dialog === 'tally'} onOpenChange={(v) => !v && setDialog(null)} />
    </section>
  );
}
