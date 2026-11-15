import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { unwrap } from '../../../shared/types';
import { scanDetector } from '../../../shared/inventory';
import { useSales } from '../sales/common';

export const INVENTORY_ROUTES = [
  'godowns',
  'stockTransfers',
  'serialLookup',
  'barcodeLabels',
  'batchExpiry',
  'pos',
];
export function useGodowns() {
  const { firmId, settings } = useSales();
  return useQuery({
    queryKey: ['godowns', firmId],
    queryFn: async () => unwrap(await window.api.inventory.godowns(firmId)),
    enabled: Boolean(settings.godowns),
  });
}
/**
 * Calls `onScan(code)` when a barcode scanner types a fast burst ending in Enter.
 * Typing into ordinary fields is ignored unless the field is marked `data-scan`.
 */
export function useScanner(onScan: (code: string) => void, enabled = true) {
  const latest = useRef(onScan);
  useEffect(() => {
    latest.current = onScan;
  });
  useEffect(() => {
    if (!enabled) return;
    const detect = scanDetector();
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editable =
        target?.closest('input,textarea,select,[contenteditable="true"]') &&
        !target.closest('[data-scan]');
      if (editable || event.ctrlKey || event.altKey || event.metaKey) return;
      const code = detect(event.key, event.timeStamp);
      if (code) {
        event.preventDefault();
        latest.current(code);
      }
    };
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, [enabled]);
}
export const inventoryTour = [
  {
    target: '[data-tour="inventory-new"]',
    title: 'inventory.tour.new',
    body: 'inventory.tour.newBody',
  },
  {
    target: '[data-tour="inventory-list"]',
    title: 'inventory.tour.list',
    body: 'inventory.tour.listBody',
  },
  {
    target: '[data-tour="inventory-actions"]',
    title: 'inventory.tour.actions',
    body: 'inventory.tour.actionsBody',
  },
];
export const posTour = [
  { target: '[data-tour="pos-search"]', title: 'pos.tour.search', body: 'pos.tour.searchBody' },
  { target: '[data-tour="pos-cart"]', title: 'pos.tour.cart', body: 'pos.tour.cartBody' },
  { target: '[data-tour="pos-pay"]', title: 'pos.tour.pay', body: 'pos.tour.payBody' },
];
