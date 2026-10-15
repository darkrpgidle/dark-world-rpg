export type SetTaggedEquipment = { set?: string | null };
export type EquippedSetGroup = { name: string; count: number };

export function equippedSetGroups(gear: readonly SetTaggedEquipment[]): EquippedSetGroup[] {
  const counts = new Map<string, number>();
  for (const item of gear) {
    if (!item.set) continue;
    counts.set(item.set, (counts.get(item.set) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function equippedSetCountAtThreshold(
  gear: readonly SetTaggedEquipment[],
  threshold: number,
) {
  return equippedSetGroups(gear).filter((group) => group.count >= threshold).length;
}

export function equippedSetAttackMultiplier(
  gear: readonly SetTaggedEquipment[],
  bonusPerSet: number,
) {
  return 1 + equippedSetCountAtThreshold(gear, 2) * bonusPerSet;
}

export function equippedSetOfflineMultiplier(
  gear: readonly SetTaggedEquipment[],
  bonusPerSet: number,
) {
  return 1 + equippedSetCountAtThreshold(gear, 4) * bonusPerSet;
}
