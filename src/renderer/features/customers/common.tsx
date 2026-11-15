import { useQuery } from '@tanstack/react-query';
import { unwrap } from '../../../shared/types';
import { useSales } from '../sales/common';
export function useCustomerRates() {
  const { firmId } = useSales();
  return useQuery({
    queryKey: ['customer-rates', firmId],
    queryFn: async () => unwrap(await window.api.customers.rates(firmId)),
  });
}
export const customerTour = [
  { target: '[data-tour="customer-new"]', title: 'orders.tour1', body: 'orders.tour1Body' },
  { target: '[data-tour="customer-list"]', title: 'orders.tour2', body: 'orders.tour2Body' },
  { target: '[data-tour="customer-actions"]', title: 'orders.tour3', body: 'orders.tour3Body' },
];
