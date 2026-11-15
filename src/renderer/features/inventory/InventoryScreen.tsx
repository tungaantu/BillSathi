import { ReportPage } from '../reports/ReportPage';
import { BarcodeLabels } from './BarcodeLabels';
import { Godowns } from './Godowns';
import { Pos } from './Pos';
import { SerialLookup } from './SerialLookup';
import { Transfers } from './Transfers';
import { inventoryTour, posTour } from './common';
import { pageTour } from '../reports/common';
import './inventory.css';

export { INVENTORY_ROUTES } from './common';
export const inventorySteps = (route: string) =>
  route === 'pos' ? posTour : route === 'batchExpiry' ? pageTour : inventoryTour;

/** Godowns, stock transfers, serial lookup, barcode labels, batch expiry and POS. */
export function InventoryScreen({ route, firmId }: { route: string; firmId: number }) {
  const screen = route.split('/')[0];
  if (screen === 'pos') return <Pos key={firmId} />;
  return (
    <div className="inventory-screen">
      {screen === 'godowns' ? (
        <Godowns />
      ) : screen === 'stockTransfers' ? (
        <Transfers />
      ) : screen === 'serialLookup' ? (
        <SerialLookup />
      ) : screen === 'barcodeLabels' ? (
        <BarcodeLabels />
      ) : (
        <ReportPage key={`${firmId}-batchExpiry`} id="batchExpiry" search="" />
      )}
    </div>
  );
}
