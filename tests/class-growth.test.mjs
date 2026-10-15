import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('./')&&!specifier.endsWith('.ts')?`${specifier}.ts`:specifier,context);}});
const {balanceConfig}=await import('../app/balance-config.ts');
const {calculateCharacterStats:calculate}=await import('../app/character-power.ts');
test('live stat calculator keeps class roles at every level, without gear or passive bonuses',()=>{
 for(let level=1;level<=100;level++){
 const w=calculate('戰士',level,[],[]),r=calculate('遊俠',level,[],[]),m=calculate('法師',level,[],[]);
 assert.ok(w.hp>r.hp&&r.hp>m.hp);assert.ok(w.defense>r.defense&&r.defense>m.defense);
 assert.ok(w.attack<r.attack&&r.attack<m.attack);assert.equal(r.speed,115);assert.equal(m.crit,8);
 for(const cls of ['戰士','遊俠','法師'])if(level>1){const prev=calculate(cls,level-1,[],[]),next=calculate(cls,level,[],[]);for(const stat of ['hp','attack','defense'])assert.equal(next[stat]-prev[stat],balanceConfig.character.levelGrowth[cls][stat]);}
 }
});
test('existing level 100 characters get the same recalculation as new characters leveled to 100',()=>{
 const expected={戰士:[3788,739,729],遊俠:[2856,846,417],法師:[2370,1058,316]};
 for(const cls of Object.keys(expected)){const s=calculate(cls,100,[],[]);assert.deepEqual([s.hp,s.attack,s.defense],expected[cls]);}
});
