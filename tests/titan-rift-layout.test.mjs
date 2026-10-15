import assert from "node:assert/strict";
import test from "node:test";
import { titanRiftPlacement, titanSpiritPlacement, titanSlashPlacement } from "../app/titan-rift-layout.ts";
import { TITAN_RIFT_FRAMES } from "../app/titan-rift-frames.ts";

// Actual screenshot geometry plus portrait dimensions used by the mobile CSS.
const desktop = { width: 972, height: 390,
  player: { left: 120, top: 15, width: 178, height: 270 },
  enemy: { left: 676, top: 19, width: 178, height: 270 } };
const scenes = [desktop, ...[272, 310, 352, 392, 600].map((width) => ({ width, height: 330,
  player: { left: 8, top: 40, width: 112, height: 158 },
  enemy: { left: width - 120, top: 40, width: 112, height: 158 } })),
  { width: 1420, height: 390,
    player: { left: 230, top: 20, width: 178, height: 270 },
    enemy: { left: 1010, top: 20, width: 178, height: 270 } }];

test("all main and echo frames fit resized stages without clipping or entering name/HP rows", () => {
  for (const scene of scenes) for (const [main, count] of [[true, 20], [false, 4]]) {
    for (let frame = 0; frame < count; frame++) {
      const aspect = main ? TITAN_RIFT_FRAMES[frame][2] / TITAN_RIFT_FRAMES[frame][3] : 1;
      const p = titanRiftPlacement(scene, frame, main, aspect);
      const epsilon = 1e-8;
      assert.ok(p.x >= p.safe.left - epsilon);
      assert.ok(p.x + p.width <= p.safe.right + epsilon);
      assert.ok(p.y >= p.safe.top - epsilon);
      assert.ok(p.y + p.height <= p.safe.bottom + epsilon);
      assert.ok(p.centerY + p.ringRadius <= p.safe.bottom + epsilon);
      assert.ok(p.centerY - p.ringRadius >= p.safe.top - epsilon);
      assert.ok(Math.abs(p.width / p.height - aspect) < epsilon);
      if (!main) {
        const targetX = scene.enemy.left + scene.enemy.width / 2;
        assert.ok(Math.abs(p.centerX - targetX) <= scene.enemy.width * (main ? 0.32 : 0.18) + epsilon);
        assert.ok(targetX >= p.x && targetX <= p.x + p.width, "impact must cover the enemy");
      }
    }
  }
});

test("the ultimate has a larger footprint on desktop and narrow mobile while names/HP stay clear", () => {
  const blade = titanRiftPlacement(desktop, 5, true, TITAN_RIFT_FRAMES[5][2] / TITAN_RIFT_FRAMES[5][3]);
  assert.ok(blade.height > 270, "desktop greatsword should exceed portrait height");
  const mobile = scenes.find((scene) => scene.width === 352);
  const impact = titanRiftPlacement(mobile, 12, true, TITAN_RIFT_FRAMES[12][2] / TITAN_RIFT_FRAMES[12][3]);
  assert.ok(impact.width > mobile.enemy.width * 1.6, "mobile impact should extend beyond the portrait");
  assert.ok(impact.y + impact.height <= mobile.enemy.top + mobile.enemy.height);
});

test("the ultimate stays centered at a fixed size through anticipation, strike and fade", () => {
  for (const scene of scenes) {
    const frames = Array.from({ length: 20 }, (_, frame) => titanRiftPlacement(scene, frame, true, 1.42));
    for (const placement of frames) {
      assert.equal(placement.centerX, scene.width / 2);
      assert.equal(placement.centerY, (placement.safe.top + placement.safe.bottom) / 2);
      assert.equal(placement.width, frames[0].width);
      assert.equal(placement.height, frames[0].height);
    }
    assert.ok(titanRiftPlacement(scene, 0, false, 1).height < frames[12].height);
  }
});

test('HD spirit stays registered and larger than stance across every viewport while slash reaches enemy',()=>{
 for(const scene of scenes)for(const ascended of [false,true]){
  const p=titanSpiritPlacement(scene,ascended);assert.equal(p.width,p.height);assert.equal(p.height,scene.player.height*(ascended?3.35:3));
  assert.ok(Math.abs(p.x+p.width/2-scene.player.left-scene.player.width*.36)<1e-8);
  assert.ok(Math.abs(p.y+p.height/2-scene.player.top-scene.player.height*.12)<1e-8);
  const slash=titanSlashPlacement(scene,ascended);const distance=Math.hypot(scene.enemy.left+scene.enemy.width*.52-scene.player.left-scene.player.width*.8,scene.enemy.top+scene.enemy.height*.56-scene.player.top-scene.player.height*.3);
  assert.ok(slash.width>distance);assert.ok(Number.isFinite(slash.angle));
 }
});
