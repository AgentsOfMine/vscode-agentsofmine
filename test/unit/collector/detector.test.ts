import * as assert from 'assert';
import * as sinon from 'sinon';
import * as childProcess from 'node:child_process';
import * as detector from '../../../src/collector/detector';

suite('collector/detector', () => {
  let execFileStub: sinon.SinonStub;

  setup(() => {
    execFileStub = sinon.stub(childProcess, 'execFile');
  });

  teardown(() => {
    sinon.restore();
  });

  test('detectCollector returns found=true when aom --version succeeds', async () => {
    execFileStub.callsFake((_cmd: string, _args: string[], _opts: object, cb: (err: null, stdout: string, stderr: string) => void) => {
      cb(null, '0.1.0', '');
    });

    const result = await detector.detectCollector();
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.version, '0.1.0');
  });

  test('detectCollector returns found=false when aom not on PATH', async () => {
    execFileStub.callsFake((_cmd: string, _args: string[], _opts: object, cb: (err: Error, stdout: string, stderr: string) => void) => {
      cb(new Error('command not found'), '', '');
    });

    const result = await detector.detectCollector();
    assert.strictEqual(result.found, false);
    assert.strictEqual(result.path, null);
    assert.strictEqual(result.version, null);
  });
});
