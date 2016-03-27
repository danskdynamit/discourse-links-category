import assertString from './util/assertString.js';

export default function trim(str, chars) {
  assertString(str);
  const pattern = chars ? new RegExp(`^[${chars}]+|[${chars}]+$`, 'g') : /^\s+|\s+$/g;
  return str.replace(pattern, '');
}
