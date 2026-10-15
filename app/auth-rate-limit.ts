export type RateRule={key:string;limit:number;seconds:number};
export function rateLimitStatement(rule:RateRule,now:number){
 const start=Math.floor(now/1000/rule.seconds)*rule.seconds,end=start+rule.seconds;
 return {sql:`INSERT INTO auth_rate_limits(key,window_start,window_end,count) VALUES(?,?,?,1)
 ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,window_end=excluded.window_end,
 count=CASE WHEN auth_rate_limits.window_start=excluded.window_start THEN min(auth_rate_limits.count+1,?) ELSE 1 END
 RETURNING count,window_end`,bindings:[rule.key,start,end,rule.limit+1]};
}
async function hashed(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export async function authenticationRules(request:Request,action:'login'|'register',username:string):Promise<RateRule[]>{
 // Cloudflare supplies this header at its edge. Never trust client X-Forwarded-For.
 const ip=request.headers.get('cf-connecting-ip');
 const source=ip&&ip.length<=64?await hashed(ip):'unknown';
 const rules:RateRule[]=[{key:'auth:global',limit:300,seconds:60}];
 if(action==='login')rules.push({key:`login:source:${source}`,limit:60,seconds:300},{key:`login:account:${await hashed(username)}`,limit:10,seconds:900});
 else rules.push({key:`register:source:${source}`,limit:5,seconds:3600});
 return rules;
}
