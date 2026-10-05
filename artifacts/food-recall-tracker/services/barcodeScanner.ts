import type { BarcodeType } from 'expo-camera';

export const SCANNER_BARCODE_TYPES: BarcodeType[] = [
  'upc_a',
  'upc_e',
  'ean13',
  'ean8',
  'code128',
  'code39',
  'code93',
  'codabar',
  'itf14',
  'qr',
  'pdf417',
  'aztec',
  'datamatrix',
];

export const SCAN_STEADY_HINT_DELAY_MS = 3_000;
export const SCAN_NO_DETECTION_LOG_DELAY_MS = 10_000;