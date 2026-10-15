import { balanceConfig } from "./balance-config";
import { dropPowerRange } from "./balance";

// Server-only issuance during character creation. No login-time refill.
export function createStarterEquipment() {
  const items = Object.keys(balanceConfig.equipment.baseStats).map((slot, index) => ({
    id: index + 1,
    name: `灰燼${slot}`,
    slot,
    quality: "普通",
    power: dropPowerRange(1, 0).minimum,
    enhance: 0,
    mapId: 1,
    equipmentType: "場景普通裝備",
    affixSchemaVersion: 7,
    sockets: { socketCount: 0, gems: [] },
    set: "",
    affixes: [],
  }));
  return { items, loadouts: { "1": items.map(item => item.id), "2": [] }, activeLoadout: 1 };
}
