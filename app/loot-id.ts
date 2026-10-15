// Random millisecond IDs collided during large offline loot batches. Keep
// numeric IDs compatible with equipment, loadouts and legacy saves.
let lastLootId = 0;
export function nextLootId(sequence = 0, now = Date.now()) {
  const candidate = Math.floor(now) * 1000 + Math.floor(Math.max(0, sequence) % 1000);
  lastLootId = Math.max(lastLootId + 1, candidate);
  if (!Number.isSafeInteger(lastLootId)) throw new RangeError("loot id overflow");
  return lastLootId;
}
