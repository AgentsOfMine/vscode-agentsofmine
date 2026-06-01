import * as assert from 'assert';
import * as extension from '../../src/extension';

suite('Extension', () => {
  test('activate and deactivate are exported functions', () => {
    assert.strictEqual(typeof extension.activate, 'function');
    assert.strictEqual(typeof extension.deactivate, 'function');
  });
});
