export type CosmeticBonusRates = {
  experience: number;
  attack: number;
  defense: number;
  hit: number;
  dodge: number;
};

export function equippedCosmeticBonuses(titleId: string, appearanceId: string): CosmeticBonusRates {
  const bonuses: CosmeticBonusRates = { experience: 0, attack: 0, defense: 0, hit: 0, dodge: 0 };
  if (titleId === "ash-conqueror") bonuses.experience += 5;
  if (titleId === "abyss-survivor") {
    bonuses.experience += 10;
    bonuses.attack += 10;
    bonuses.defense += 10;
  }
  if (appearanceId === "ember-aura") bonuses.attack += 5;
  if (appearanceId === "arcane-aura") {
    bonuses.attack += 10;
    bonuses.defense += 10;
  }
  if (appearanceId === "abyss-aura") {
    bonuses.attack += 15;
    bonuses.defense += 10;
    bonuses.hit += 10;
    bonuses.dodge += 10;
  }
  return bonuses;
}
