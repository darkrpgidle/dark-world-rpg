export type FloatChannel = "primary" | "extra" | "dot" | "ultimate" | "status";
export type CombatFloatEvent = {
  id: string; target: "enemy" | "player"; channel: FloatChannel;
  damage?: number; text?: string; label?: string; critical?: boolean; delayMs?: number;
  tone?: "normal" | "gold" | "violet" | "element" | "bleed" | "burn" | "ice";
  volley?: boolean;
};
export type CombatFloatHit = { damage: number; critical: boolean; delayMs?: number;
  label?: string; text?: string; skyIndex?: number; channel?: FloatChannel };
export type CombatFloatInputs = {
  groups: { key: number; titan?: boolean; ultimate?: boolean; skillName?: string; hits: CombatFloatHit[] }[];
  elementals: { key: number; volley: boolean; hits: { damage: number; label: string; delayMs?: number }[] }[];
  dots: { key: number; kind: "bleed" | "burn" | "freeze" | "echo"; damage: number; critical?: boolean }[];
  player: { key: number; damage: number; dodged: boolean; blocked?: boolean; label?: string } | null;
  enemy: { key: number; damage: number; dodged: boolean } | null;
  miss: number | null; counter: number | null; boss: boolean;
  custom?: CombatFloatEvent[];
};
// This adapter consumes display snapshots only. New skill labels automatically
// use the shared allocator; a producer may specify channel for unusual feedback.
export function collectCombatFloats(input: CombatFloatInputs,
  identity: (source: object) => string = (source) => String((source as { key: number }).key)): CombatFloatEvent[] {
  const events: CombatFloatEvent[] = [];
  for (const group of input.groups) group.hits.forEach((hit, index) => {
    if (!hit.text && (!(hit.damage > 0) || !Number.isFinite(hit.damage))) return;
    const ultimate = group.ultimate || group.titan || hit.label?.endsWith("主箭");
    const extra = ["追加", "追擊", "震地", "死亡鎖定", "六重風葬"].includes(hit.label ?? "");
    const skill=[hit.label,group.skillName].filter(Boolean).join(" ");
    events.push({ id: `hit:${identity(group)}:${index}`, target: "enemy",
      damage: hit.text ? undefined : hit.damage, text: hit.text, critical: hit.text ? false : hit.critical,
      volley: group.skillName === "疾風連射",
      label: hit.label ?? group.skillName ?? (group.titan ? "泰坦斷界斬" : undefined),
      channel: hit.text ? "status" : hit.channel ?? (ultimate ? "ultimate" : extra ? "extra" : "primary"),
      tone: /天罰|星隕|六重風葬|死亡鎖定|雷環|奧術|隕星|星界/.test(skill) ? "violet"
        : /破星|穿雲|追風|疾風|追擊|霜|閃電/.test(skill) ? "ice"
        : /血|裂傷/.test(skill) ? "bleed"
        : /火|燃燒|灼燒/.test(skill) ? "burn"
        : ultimate || /裂地|碎甲|震地|聖箭/.test(skill) ? "gold" : "normal",
      delayMs: Math.max(0, hit.delayMs ?? index * 110) });
  });
  for (const group of input.elementals) group.hits.forEach((hit, index) => {
    if (!(hit.damage > 0) || !Number.isFinite(hit.damage)) return;
    events.push({ id: `element:${identity(group)}:${index}`, target: "enemy", channel: "extra",
      damage: hit.damage, label: hit.label, tone: "element", delayMs: hit.delayMs ?? (group.volley ? 495 + index * 110 : index * 110) });
  });
  for (const dot of input.dots) if (dot.damage > 0 && Number.isFinite(dot.damage))
    events.push({ id: `dot:${identity(dot)}`, target: "enemy", channel: dot.kind === "echo" || dot.kind === "freeze" ? "extra" : "dot", damage: dot.damage, critical: dot.critical,
      label: dot.kind === "bleed" ? "流血" : dot.kind === "freeze" ? "冰碎" : dot.kind === "echo" ? "餘燼回響" : "灼燒", tone: dot.kind === "freeze" ? "ice" : dot.kind === "echo" ? "violet" : dot.kind });
  // Tower enemy feedback duplicates player damage; boss enemy feedback is the
  // already displayed outgoing hit. Prefer the player snapshot, never both.
  const injury: CombatFloatInputs["player"] = input.player ?? (!input.boss ? input.enemy : null);
  if (injury) {
    const blocked = injury.blocked;
    const text = injury.label || (blocked ? "格擋！" : injury.dodged ? "閃避！" : undefined);
    if (text || injury.damage > 0 && Number.isFinite(injury.damage))
      events.push({ id: `injury:${identity(injury)}`, target: "player", channel: text ? "status" : "primary",
        text, damage: text ? undefined : injury.damage, tone: text ? "gold" : "normal" });
  }
  if (input.miss !== null) events.push({ id: `miss:${input.miss}`, target: "enemy", channel: "status", text: "未命中！" });
  if (input.counter !== null) events.push({ id: `counter:${input.counter}`, target: "player", channel: "status", text: "反擊成功！", tone: "gold" });
  events.push(...(input.custom ?? []));
  return events.filter((event)=>event.id && (event.text || event.damage !== undefined && event.damage>0 && Number.isFinite(event.damage)))
    .map((event)=>({...event,delayMs:Number.isFinite(event.delayMs) ? Math.max(0,event.delayMs??0) : 0}));
}

// Preserve every asynchronous segment and the already-settled HP total, including
// rounding residues and overkill. This function never applies combat damage.
export function splitAsyncDamageForDisplay<T extends { damage: number }>(events: readonly T[], actualDamage: number): T[] {
  // Keep the settled precision. Text rendering rounds numbers separately;
  // rounding every DOT here loses fractional HP across successive ticks.
  const total = Math.max(0, actualDamage);
  let raw = 0;
  let allocated = 0;
  return events.flatMap((event, index) => {
    raw += Math.max(0, event.damage);
    const next = index === events.length - 1 ? total : Math.min(total, raw);
    const damage = Math.max(0, next - allocated);
    allocated += damage;
    return damage > 0 ? [{ ...event, damage }] : [];
  });
}
