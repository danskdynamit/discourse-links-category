import assertString from './util/assertString.js';
import toString from './util/toString';

export default function contains(str, elem) {
  assertString(str);
  return str.indexOf(toString(elem)) >= 0;
}
