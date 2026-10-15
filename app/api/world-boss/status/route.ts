import {getDb} from '../../../../db';
import {settleWorldBoss,worldBossCycle} from '../../../world-boss-rewards';
// Public status read performs only server-clock-authorized due housekeeping.
// No caller-supplied cycle, recipient or rewards are accepted.
export async function GET(){
 const db=await getDb();const result=await settleWorldBoss(db.$client);
 const last=await db.$client.prepare('SELECT cycle,completed_at,winners FROM world_boss_settlements ORDER BY cycle DESC LIMIT 1').first<{cycle:string;completed_at:string;winners:string}>();
 return Response.json({activeCycle:worldBossCycle(),settled:result.settled,lastSettlement:last?{cycle:last.cycle,completedAt:last.completed_at,winners:JSON.parse(last.winners).length}:null},{headers:{'Cache-Control':'no-store'}});
}
