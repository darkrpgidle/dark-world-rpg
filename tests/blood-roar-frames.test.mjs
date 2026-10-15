import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const js = ts.transpile(readFileSync('app/blood-roar-frames.ts', 'utf8'), { module: ts.ModuleKind.ESNext });
const { bloodRoarFrame, bloodRoarUv } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('activation reaches all 24 cells, never wraps into another row', () => {
 for(let i=0;i<24;i++) assert.equal(bloodRoarFrame(i*60),i);
 assert.equal(bloodRoarFrame(1440),23);
 for(let i=0;i<24;i++) { const [x,y,w,h]=bloodRoarUv(i); assert.ok(x>=0 && y>=0 && x+w<=1 && y+h<=1); }
});
test('persistent aura loops only open-center flames and reduced motion is stable', () => {
 for(let t=0;t<10000;t+=100) assert.ok(bloodRoarFrame(t,true)>=12 && bloodRoarFrame(t,true)<=17);
 assert.equal(bloodRoarFrame(0,true,true),bloodRoarFrame(10000,true,true));
});
