import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildExifJpeg, buildHeicWithExif} from '../tools/photo-exif.mjs';
import {readPhotos, clusterPhotos, matchLocal, buildVisits, groupTrips, cleanName, pickPoi, haversine, renderReport, isDefinitelyOverseas} from '../tools/photos-to-places.mjs';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-photo-'));
const A = path.join(dir, '旅行A');
const B = path.join(dir, '旅行B');
await fs.mkdir(A, {recursive: true});
await fs.mkdir(B, {recursive: true});

const LAT = 31.2304, LON = 121.4737;
const FAR = LAT + 0.0030; // ~330m，超过 200m 聚类半径，应分成另一簇

await fs.writeFile(path.join(A, 'a1.jpg'), buildExifJpeg({lat: LAT, lon: LON, dateTime: '2024:05:01 09:00:00'}));
await fs.writeFile(path.join(A, 'a2.jpg'), buildExifJpeg({lat: LAT, lon: LON, dateTime: '2024:05:01 09:30:00'}));
await fs.writeFile(path.join(A, 'a3.jpg'), buildExifJpeg({lat: FAR, lon: LON, dateTime: '2024:05:01 13:00:00'}));
await fs.writeFile(path.join(B, 'b1.heic'), buildHeicWithExif({lat: LAT, lon: LON, dateTime: '2024:05:02 10:00:00'}));
await fs.writeFile(path.join(B, 'b2.heic'), buildHeicWithExif({lat: LAT, lon: LON, dateTime: '2024:05:02 10:20:00'}));
await fs.writeFile(path.join(B, 'note.txt'), 'not an image');

const {photos, stats} = await readPhotos([A, B]);
assert.equal(stats.images, 5, '应识别 5 张图片');
assert.equal(stats.skippedOther, 1, '应跳过 1 个非图片文件');
assert.equal(photos.length, 5, '5 张均应带 GPS 与日期');

// 跨文件夹、跨日期的同一坐标应聚为一簇
const clusters = clusterPhotos(photos, 200);
assert.equal(clusters.length, 2, '应聚成 2 个地点簇');
const big = clusters.find(c => c.photos.length === 4);
const small = clusters.find(c => c.photos.length === 1);
assert.ok(big && small, '应有一个 4 张的簇和一个 1 张的簇');
assert.deepEqual(big.dirs, ['旅行A', '旅行B'], '同一簇应跨文件夹');
assert.deepEqual(big.dates, ['2024-05-01', '2024-05-02'], '同一簇应跨日期');
assert.equal(small.dates[0], '2024-05-01');

// 本地库为空时全部待查
matchLocal(clusters, [], 150);
assert.ok(clusters.every(c => c.needsQuery === true), '无本地库时全部待查');

// 行程：05-01 两处、05-02 一处
const visits = buildVisits(clusters, 80);
assert.equal(visits.length, 3, '应有 3 段到访');
const d1 = visits.filter(v => v.date === '2024-05-01');
assert.equal(d1.length, 2, '05-01 应有 2 段');
assert.equal(d1[0].first_time, '09:00', '按时间排序');
assert.equal(d1[0].photo_count, 2, '近邻合并后照片数');
assert.equal(visits.filter(v => v.date === '2024-05-02')[0].photo_count, 2);

// 行程分组
const trips = groupTrips(visits);
assert.equal(trips.length, 1, '连续两天应为一段行程');
assert.equal(trips[0].days, 2);

// 报告
const md = renderReport({stamp: '20240101', dirs: [A, B], stats, clusters, visits, amap: null, opts: {clusterRadius: 200, dedupe: 80}});
assert.ok(md.includes('## 2024-05-01'), '报告应按日期分节');
assert.ok(md.includes('## 2024-05-02'), '报告应包含第二天');
assert.ok(md.includes('月度概览'), '报告应有月度概览');
assert.ok(md.includes('未匹配地点'), '未查询时显示占位');

// 名称清洗与 POI 选择
assert.equal(cleanName('千岛湖东南湖区旅游码头-地面停车场'), '千岛湖东南湖区旅游码头');
assert.equal(cleanName('西湖景区停车场'), '西湖景区');
const poi = pickPoi([{name: '某某停车场', dist: 10}, {name: '西湖风景名胜区', dist: 300}]);
assert.equal(poi.name, '西湖风景名胜区', '应过滤停车场并选景区');
assert.ok(haversine([LAT, LON], [LAT, LON]) === 0);

// 境外判断：香港/新加坡为境外，上海/深圳为境内
assert.equal(isDefinitelyOverseas({lat: 22.30, lon: 114.17}), true, '香港应判为境外');
assert.equal(isDefinitelyOverseas({lat: 1.30, lon: 103.80}), true, '新加坡应判为境外');
assert.equal(isDefinitelyOverseas({lat: 31.23, lon: 121.47}), false, '上海应判为境内');
assert.equal(isDefinitelyOverseas({lat: 22.54, lon: 114.06}), false, '深圳不应误判为境外');

await fs.rm(dir, {recursive: true, force: true});
console.log('Photo EXIF/HEIC clustering, itinerary and two-tier POI selection: passed');
