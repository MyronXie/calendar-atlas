import assert from 'node:assert/strict';
import {inferPlaceType, inferPlaceLabels} from '../lib/place-categories.js';

assert.equal(inferPlaceType('蓝眼泪观景点'), 'out');
assert.equal(inferPlaceType('重庆江北国际机场'), 'trans');
assert.equal(inferPlaceType('天星正源火锅(海椒市店)'), 'food');
assert.equal(inferPlaceType('全季酒店'), 'stay');
assert.equal(inferPlaceType('学生共享空间文印室'), 'edu');
assert.equal(inferPlaceType('武康大楼'), 'other');
assert.deepEqual(inferPlaceLabels('天星正源火锅'), ['火锅']);
assert.ok(inferPlaceLabels('小石岛景区').includes('景区'));
assert.ok(inferPlaceLabels('某某咖啡店').includes('咖啡'));
console.log('Deterministic place type/label inference: passed');
