import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const page=read('app/page.tsx'),layer=read('app/combat-damage-layer.tsx'),agents=read('AGENTS.md'),vfx=read('docs/VFX.md');
test('all existing combat categories feed one shared layer with no legacy numeric overlay',()=>{
 assert.equal((page.match(/<CombatDamageLayer/g)||[]).length,1);
 for(const binding of ['groups: battleHitGroups','elementals: setElementalHits','dots: dotDamageGroups','player: playerHitFeedback','enemy: enemyHitFeedback','miss: missFeedback','counter: unyieldingCounterFeedback'])assert.ok(page.includes(binding),binding);
 assert.doesNotMatch(page,/className=\{?["`]([^"`]*\b(?:titan-damage-float|damage-sequence|combo-hit|enemy-damage-float|player-hit-float|missed-float)\b)/);
 assert.match(layer,/collectCombatFloats\(inputs/);assert.match(layer,/new CombatFloatLayout\(\)/);
});
test('future skill and VFX authoring instructions require shared numbers and preserve impact callbacks',()=>{
 assert.match(agents,/所有傷害.*CombatDamageLayer/);assert.match(agents,/不得新增獨立浮字 DOM/);assert.match(agents,/DAMAGE_FLOATS.md/);
 assert.match(vfx,/所有現有與後續技能必須使用共用/);
 for(const callback of ['publishTitanImpactDamage','publishSkyRainImpact','publishVolleyImpact','publishStarbreakImpact','publishPiercingImpactDamage','publishTailwindImpactDamage','publishGroundImpactDamage'])assert.ok(page.includes(callback),callback);
});
