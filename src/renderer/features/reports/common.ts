import { REPORTS } from '../../../shared/reports';
import type { Settings } from '../../../shared/types';

export const reportIds = (settings: Settings, key: 'favourites' | 'recent') =>
  String(settings[`reports.${key}`] ?? '')
    .split(',')
    .filter((id) => REPORTS.some((r) => r.id === id));
export const shortcutIds = (settings: Settings) =>
  [...new Set([...reportIds(settings, 'favourites'), ...reportIds(settings, 'recent')])].slice(
    0,
    6,
  );
export const homeTour = [
  {
    target: '[data-tour="report-search"]',
    title: 'reports.tour.search',
    body: 'reports.tour.searchBody',
  },
  {
    target: '[data-tour="report-cards"]',
    title: 'reports.tour.cards',
    body: 'reports.tour.cardsBody',
  },
  {
    target: '[data-tour="report-pins"]',
    title: 'reports.tour.pins',
    body: 'reports.tour.pinsBody',
  },
];
export const pageTour = [
  {
    target: '[data-tour="report-filters"]',
    title: 'reports.tour.filters',
    body: 'reports.tour.filtersBody',
  },
  {
    target: '[data-tour="report-table"]',
    title: 'reports.tour.table',
    body: 'reports.tour.tableBody',
  },
  {
    target: '[data-tour="report-export"]',
    title: 'reports.tour.export',
    body: 'reports.tour.exportBody',
  },
];
