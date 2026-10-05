import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCAN_NO_DETECTION_LOG_DELAY_MS,
  SCAN_STEADY_HINT_DELAY_MS,
  SCANNER_BARCODE_TYPES,
  shouldLogNoDetectionWarning,
} from '../services/barcodeScanner.ts';

test('scanner enables all barcode formats supported by Expo Camera', () => {
  assert.deepEqual(new Set(SCANNER_BARCODE_TYPES), new Set([
    'aztec',
    'ean13',
    'ean8',
    'qr',
    'pdf417',
    'upc_e',
    'datamatrix',
    'code39',
    'code93',
    'itf14',
    'codabar',
    'code128',
    'upc_a',
  ]));
});

test('scanner shows its steadying hint before logging a prolonged no-detection warning', () => {
  assert.equal(SCAN_STEADY_HINT_DELAY_MS, 3_000);
  assert.equal(SCAN_NO_DETECTION_LOG_DELAY_MS, 10_000);
  assert.equal(
    SCAN_STEADY_HINT_DELAY_MS < SCAN_NO_DETECTION_LOG_DELAY_MS,
    true,
  );
});

test('no-detection warning only logs for the active, focused, ready scan attempt', () => {
  const activeScan = {
    attemptId: 4,
    activeAttemptId: 4,
    cameraReady: true,
    screenFocused: true,
    scanLocked: false,
    scanState: 'ready' as const,
  };

  assert.equal(shouldLogNoDetectionWarning(activeScan), true);
  assert.equal(
    shouldLogNoDetectionWarning({ ...activeScan, activeAttemptId: 5 }),
    false,
  );
  assert.equal(
    shouldLogNoDetectionWarning({ ...activeScan, scanLocked: true }),
    false,
  );
  assert.equal(
    shouldLogNoDetectionWarning({ ...activeScan, cameraReady: false }),
    false,
  );
  assert.equal(
    shouldLogNoDetectionWarning({ ...activeScan, screenFocused: false }),
    false,
  );
  assert.equal(
    shouldLogNoDetectionWarning({ ...activeScan, scanState: 'verdict' }),
    false,
  );
});