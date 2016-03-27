import assertString from './util/assertString.js';

import { fullWidth } from './isFullWidth';
import { halfWidth } from './isHalfWidth';

export default function isVariableWidth(str) {
  assertString(str);
  return fullWidth.test(str) && halfWidth.test(str);
}
