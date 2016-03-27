import assertString from './util/assertString.js';

export default function isNull(str) {
  assertString(str);
  return str.length === 0;
}
