export { DEFAULT_DECODE_LIMITS, ImageDecodeError, decodeImage } from './decode';
export type { DecodeLimits, ImageDecodeErrorCode } from './decode';
export {
  DEFAULT_MAX_COLORS,
  MERGE_OKLAB_DISTANCE,
  MERGE_RGB_CHANNEL_DELTA,
  MIN_OPAQUE_ALPHA,
  MIN_SWATCH_PIXEL_SHARE,
  extractColors,
} from './extract';
export type { ExtractOptions } from './extract';
export { simulateCvd } from './simulate';
export { analyzeColors } from './conflicts';
export { cssToSourcePixel, pickColor } from './picker';
