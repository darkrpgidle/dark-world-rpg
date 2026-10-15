import { balanceConfig } from "./balance-config";

// Display units only. Raw scores stay authoritative for sorting, comparisons,
// salvage protection, map advice and the server's save/combat calculations.
export function formatAssessedPower(rawPower: number): string {
  if (!Number.isFinite(rawPower)) return "0";
  const rounded = Math.round(Math.abs(rawPower) / balanceConfig.character.powerAssessment.displayDivisor);
  return (rawPower < 0 && rounded > 0 ? -rounded : rounded).toLocaleString("zh-TW");
}
