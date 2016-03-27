import assertString from './util/assertString.js';

import isHexadecimal from './isHexadecimal';

export default function isMongoId(str) {
  assertString(str);
  return isHexadecimal(str) && str.length === 24;
}
