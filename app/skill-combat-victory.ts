// At most two 30-floor runs are retained. Delayed callbacks from a previous
// monster cannot grant its reward again after the next monster has spawned.
export function createCombatVictoryGuard() {
  const claimed = new Set<string>();
  return {
    has(targetKey: string) {
      return claimed.has(targetKey);
    },
    claim(targetKey: string) {
      if (!targetKey) throw new RangeError("Missing combat target");
      if (claimed.has(targetKey)) return false;
      claimed.add(targetKey);
      if (claimed.size > 64) claimed.delete(claimed.values().next().value!);
      return true;
    },
  };
}

