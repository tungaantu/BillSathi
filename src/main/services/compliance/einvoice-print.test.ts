import { expect, it } from 'vitest';
import { invoiceHtml } from '../../../shared/invoice-html';
import { PRINT_DEFAULTS } from '../../../shared/print-settings';
import { source } from './compliance-fixture.test-helper';

const render = (einvoice?: Parameters<typeof invoiceHtml>[0]['einvoice']) => {
  const { firm, doc } = source();
  return invoiceHtml({ firm, doc, settings: { ...PRINT_DEFAULTS }, labels: {}, einvoice });
};
const labels = { irn: 'IRN', ackNo: 'Ack No', ackDate: 'Ack Date' };

it('prints the IRN, acknowledgement and signed QR only once they have been saved', () => {
  expect(render()).not.toContain('class="einv"');
  const html = render({
    irn: 'a'.repeat(64),
    ackNo: '112010012345678',
    ackDate: '2026-11-10 12:30:00',
    qr: 'data:image/png;base64,iVBORw0KGgo=',
    labels,
  });
  expect(html).toContain('class="einv"');
  expect(html).toContain(`IRN:</strong> ${'a'.repeat(64)}`);
  expect(html).toContain('Ack No: 112010012345678');
  expect(html).toContain('Ack Date: 2026-11-10 12:30:00');
  expect(html).toContain('<img');
});

it('escapes pasted values and ignores a QR that is not an image data URL', () => {
  const html = render({
    irn: '<script>alert(1)</script>',
    ackNo: '1',
    ackDate: 'x',
    qr: 'javascript:alert(1)',
    labels,
  });
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('javascript:');
});
