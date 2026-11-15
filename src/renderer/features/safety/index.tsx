import type { TourStep } from '../../components/ui';
import { BackupPage } from './BackupPage';
import { RecycleBin } from './RecycleBin';
import { AuditTrail } from './AuditTrail';
import { VerifyData } from './VerifyData';

export { LockGate } from './LockGate';
export { PasscodeSettings } from './PasscodeSettings';
export { BackupSettings } from './BackupSettings';
export { BackupReminder } from './BackupReminder';
export { requirePin, requirePinIfSet, useRequirePin } from './lock';

export const SAFETY_ROUTES = ['backup', 'recycleBin', 'auditTrail', 'verifyData'];
export function SafetyScreen({ route }: { route: string }) {
  switch (route.split('/')[0]) {
    case 'backup':
      return <BackupPage />;
    case 'recycleBin':
      return <RecycleBin />;
    case 'auditTrail':
      return <AuditTrail />;
    default:
      return <VerifyData />;
  }
}

const step = (screen: string, n: number, target: string): TourStep => ({
  target: `[data-tour="${target}"]`,
  title: `safety.tour.${screen}.${n}.title`,
  body: `safety.tour.${screen}.${n}.body`,
});
const TOURS: Record<string, { screen: string; targets: string[] }> = {
  backup: { screen: 'backup', targets: ['safety-main', 'safety-actions', 'safety-list'] },
  recycleBin: { screen: 'recycleBin', targets: ['safety-head', 'safety-main'] },
  auditTrail: { screen: 'auditTrail', targets: ['safety-head', 'safety-actions', 'safety-main'] },
  verifyData: { screen: 'verifyData', targets: ['safety-head', 'safety-main'] },
  lock: { screen: 'lock', targets: ['safety-lock', 'safety-lock', 'safety-lock'] },
};
/** Tour for the safety screens and for the passcode card in Settings → General. */
export function safetyTour(route: string): { screen: string; steps: TourStep[] } | undefined {
  const id = route === 'settings' || route === 'settings/general' ? 'lock' : route.split('/')[0];
  const tour = TOURS[id];
  if (!tour) return undefined;
  return {
    screen: id === 'lock' ? 'settings-lock' : tour.screen,
    steps: tour.targets.map((target, i) => step(tour.screen, i + 1, target)),
  };
}
