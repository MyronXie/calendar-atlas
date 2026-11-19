// All entries are fabricated. Relative dates keep the default recent view populated
// while the fixed dates exercise known year ranges and leap-year boundaries.
export function runtimeCalendar(now=new Date()){
 const stamp=daysAgo=>{
  const date=new Date(now);
  date.setUTCDate(date.getUTCDate()-daysAgo);
  return date.toISOString().slice(0,10).replaceAll('-','')+'T100000Z';
 };
 const events=[
  ['20190101T100000Z','[测试行程] 旧记录甲','测试公园甲'],
  ['20200229T100000Z','[测试行程] 闰年记录','测试公园甲'],
  ['20210601T100000Z','[测试行程] 历史记录','测试历史地点丙'],
  ['20240229T100000Z','[测试行程] 二月记录','测试博物馆乙'],
  ['20250228T100000Z','[测试行程] 平年记录','测试公园甲'],
  [stamp(5),'[测试活动] 展览甲','测试博物馆乙'],
  [stamp(4),'[测试活动] 散步甲','测试公园甲'],
  [stamp(3),'[测试活动] 散步乙','测试公园甲'],
 ];
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Calendar Atlas//Synthetic browser fixture//EN',
  ...events.flatMap(([start,summary,place],index)=>[
   'BEGIN:VEVENT','UID:synthetic-atlas-'+index+'@example.invalid','DTSTAMP:20260101T000000Z',
   'DTSTART:'+start,'SUMMARY:'+summary,'LOCATION:'+place,
   'DESCRIPTION:Partner: 测试同伴甲；测试同伴乙\\n备注：合成日历记录',
   'END:VEVENT',
  ]),'END:VCALENDAR',''].join('\r\n');
}
