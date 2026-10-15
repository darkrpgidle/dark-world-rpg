export type CombatCadence = { token: string | object; player: number; enemy: number };
// State/gear/sync renders can restart the effect without resetting time already
// accumulated for the same encounter. A new target starts a fresh cadence.
export function retainCombatCadence(previous: CombatCadence | null, token: string | object): CombatCadence {
  return previous?.token === token ? previous : { token, player: 0, enemy: 0 };
}
