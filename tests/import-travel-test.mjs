import assert from 'node:assert/strict';
import {compareCalendars} from '../calendar-import.js';
import {isTrip,tripDetails} from '../travel.js';

const calendar=(...records)=>['BEGIN:VCALENDAR','VERSION:2.0',...records,'END:VCALENDAR'].join('\r\n');
const entry=(uid,title,location,note='',stamp='20260401T100000Z')=>[
 'BEGIN:VEVENT','UID:'+uid,'DTSTART:20260405T100000Z','DTSTAMP:'+stamp,'SUMMARY:'+title,
 'LOCATION:'+location,'DESCRIPTION:'+note,'END:VEVENT'
].join('\r\n');
const old=calendar(entry('updated','Synthetic trip','Test park'),entry('missing','Old event','Test park'),
 entry('same','Other event','Test park'));
const next=calendar(entry('updated','Synthetic trip','Test park','Place: Test museum\\nPartner: Tester'),
 entry('new','New event','Unknown place'),entry('same','Other event','Test park','','20260402T100000Z'));
const preview=compareCalendars(old,next,name=>['Test park','Test museum'].includes(name));
assert.deepEqual(preview.added.map(row=>row.title),['New event']);
assert.deepEqual(preview.missing.map(row=>row.title),['Old event']);
assert.equal(preview.changed.length,1);
assert.deepEqual(preview.changed[0].addedPlaces,['Test museum']);
assert.deepEqual(preview.changed[0].addedPartners,['Tester']);
assert.deepEqual(preview.unmatched,['Unknown place']);
assert.throws(()=>compareCalendars(old,calendar(),()=>true));

const trip={
 title:'[测试组]合成之旅',start:new Date(2026,3,4,20),end:new Date(2026,3,8,22),
 places:['未知地点','地点甲','地点乙','地点丙','地点丁'],
 note:'Partner：测试同伴\nPlace：未知地点\n【4/5】\nPlace：地点甲；地点乙\nDay 3\nPlace：地点丙\n【4月8日】\nPlace：地点丁；排除地点',
};
assert.ok(isTrip(trip));
assert.deepEqual(tripDetails(trip),{
 start:'2026-04-04',end:'2026-04-08',
 days:[
  {label:'2026-04-05',places:['地点甲','地点乙']},
  {label:'2026-04-06',places:['地点丙']},
  {label:'2026-04-08',places:['地点丁']},
  {label:'日期待确认',places:['未知地点']},
 ]
});
assert.equal(tripDetails({ ...trip,allDay:true,end:new Date(2026,3,8)}).end,'2026-04-07');
