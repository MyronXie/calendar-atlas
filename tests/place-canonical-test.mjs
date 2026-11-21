import assert from 'node:assert/strict';
import {details, setPlaceResolver} from '../lib/core.js';

setPlaceResolver(name => name === '上海静安大悦城' ? '上海大悦城' : name);
const d = details({location: '上海静安大悦城', description: 'Place：上海静安大悦城；上海大悦城'});
assert.deepEqual(d.places, ['上海大悦城']);
setPlaceResolver(null);
const raw = details({location: '上海静安大悦城', description: 'Place：上海静安大悦城；上海大悦城'});
assert.deepEqual(raw.places, ['上海静安大悦城', '上海大悦城']);
console.log('Place alias canonicalization to location: passed');
