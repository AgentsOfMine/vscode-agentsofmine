import * as assert from 'assert';
import * as path from 'path';

interface QrCode {
  addData(data: string): void;
  make(): void;
  createDataURL(cellSize?: number, margin?: number): string;
  getModuleCount(): number;
}
type QrFactory = (typeNumber: number, ecl: string) => QrCode;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const qrcode = require(path.join(__dirname, '../../../../assets/qrcode.js')) as QrFactory;

suite('pairing/qr', () => {
  const url =
    'https://agentsofmine.io/pair?code=AG7XKJ2P&device=2ed2ba07-3e6d-48e8-9b2c-8e523bfb378f';

  test('bundled qrcode.js produces a valid GIF data URI for a pairing URL', () => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const uri = qr.createDataURL(6, 16);

    assert.ok(uri.startsWith('data:image/gif;base64,'), 'data URI has gif mime prefix');
    assert.ok(uri.length > 1000, 'data URI is non-trivial');

    const buf = Buffer.from(uri.split(',')[1] ?? '', 'base64');
    assert.strictEqual(buf.subarray(0, 3).toString('ascii'), 'GIF', 'decodes to a real GIF');
  });

  test('encodes auto-sized QR with a sane module count', () => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    assert.ok(qr.getModuleCount() >= 21, 'QR has at least the v1 module count');
  });
});
