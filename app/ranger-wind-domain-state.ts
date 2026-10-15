import type { RangerWindDomain } from "./skill-ranger-rules";
export type WindDomainVisual = RangerWindDomain & { castKey: number; pulseKey: number; ending: boolean };
export function windDomainVisualState(domain: RangerWindDomain, previous: WindDomainVisual | null,
  eventKey: number, activated: boolean, attacking: boolean): WindDomainVisual | null {
  if (domain.remainingActions <= 0) return previous && !previous.ending
    ? { ...previous, remainingActions: 0, ending: true, pulseKey: eventKey } : previous;
  return { ...domain, castKey: activated || !previous || previous.ending ? eventKey : previous.castKey,
    pulseKey: attacking ? eventKey : previous?.pulseKey ?? 0, ending: false };
}
