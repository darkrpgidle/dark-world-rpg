import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("/app/") && specifier.startsWith("./") && !specifier.endsWith(".ts"))
    return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { buyYuanbaoCosmetic, buyYuanbaoReforgeBundle, cosmeticSku, preserveServerShopPurchases } = await import("../app/shop-purchase.ts");
const { equippedCosmeticBonuses } = await import("../app/cosmetic-bonuses.ts");
const id = "12345678-1234-1234-1234-123456789abc";
const state = () => ({ yuanbao: 20, reforgeStones: 3, adminRevision: 2, level: 5 });

test("buying the bundle charges and grants exactly once", () => {
  const bought = buyYuanbaoReforgeBundle(state(), id);
  assert.equal(bought.accepted, true);
  assert.equal(bought.save.yuanbao, 10);
  assert.equal(bought.save.reforgeStones, 15);
  assert.equal(bought.save.adminRevision, 3);
  assert.equal(bought.save.level, 5);
  const retry = buyYuanbaoReforgeBundle(bought.save, id);
  assert.equal(retry.accepted, false);
  assert.deepEqual(retry.save, bought.save);
});

test("insufficient balance, malformed state and invalid receipts reject purchase", () => {
  assert.equal(buyYuanbaoReforgeBundle({ ...state(), yuanbao: 9 }, id), null);
  assert.equal(buyYuanbaoReforgeBundle({ ...state(), yuanbao: "20" }, id), null);
  assert.equal(buyYuanbaoReforgeBundle({ ...state(), reforgeStones: -1 }, id), null);
  assert.equal(buyYuanbaoReforgeBundle({ ...state(), adminRevision: Number.MAX_SAFE_INTEGER }, id), null);
  assert.equal(buyYuanbaoReforgeBundle(state(), "wrong"), null);
});

test("generic autosaves cannot erase or forge purchase receipts", () => {
  const bought = buyYuanbaoReforgeBundle(state(), id).save;
  const forged = preserveServerShopPurchases({ ...state(), _shopPurchaseIds: ["fake"] }, bought);
  assert.deepEqual(forged._shopPurchaseIds, [id]);
  assert.deepEqual(preserveServerShopPurchases({ ...state(), _shopPurchaseIds: [id] }, null)._shopPurchaseIds, []);
});

const cosmeticCases = [
  ["title-ash", 200, "ownedTitles", "selectedTitle", "ash-conqueror"],
  ["title-abyss", 2000, "ownedTitles", "selectedTitle", "abyss-survivor"],
  ["appearance-ember", 500, "ownedAppearances", "selectedAppearance", "ember-aura"],
  ["appearance-arcane", 1500, "ownedAppearances", "selectedAppearance", "arcane-aura"],
  ["appearance-abyss", 4500, "ownedAppearances", "selectedAppearance", "abyss-aura"],
];

test("all five cosmetic SKUs atomically deduct their price and unlock the correct item", () => {
  for (const [sku, price, field, selected, ownedId] of cosmeticCases) {
    const legacy = { ...state(), yuanbao: 6000, mapBestFloors: { 1: 30, 9: 30 }, finalBossDefeated: true,
      ownedTitles: ["none", "night-watcher"],
      ownedAppearances: ["none"], selectedTitle: "night-watcher" };
    const bought = buyYuanbaoCosmetic(legacy, sku, id);
    assert.equal(bought.accepted, true, sku);
    assert.equal(bought.save.yuanbao, 6000 - price, sku);
    assert.equal(bought.save.adminRevision, 3, sku);
    assert.ok(bought.save[field].includes(ownedId), sku);
    assert.equal(bought.save[selected], ownedId, sku);
    assert.ok(bought.save.ownedTitles.includes("night-watcher"));
    assert.equal(buyYuanbaoCosmetic(bought.save, sku, id).accepted, false);
    assert.equal(buyYuanbaoCosmetic(bought.save, sku, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), null);
  }
});

test("cosmetic purchases reject forged SKU, insufficient funds, and duplicate entitlement", () => {
  assert.equal(cosmeticSku("__proto__"), false);
  assert.equal(buyYuanbaoCosmetic({ ...state(), yuanbao: 1 }, "title-ash", id), null);
  assert.equal(buyYuanbaoCosmetic(state(), "__proto__", id), null);
  assert.equal(buyYuanbaoCosmetic({ ...state(), yuanbao: 500, ownedTitles: ["ash-conqueror"] }, "title-ash", id), null);
});

test("title purchases require the corresponding map clear", () => {
  const eligible = { ...state(), yuanbao: 5000, mapBestFloors: { 1: 30 } };
  assert.equal(buyYuanbaoCosmetic({ ...state(), yuanbao: 5000 }, "title-ash", id), null);
  assert.equal(buyYuanbaoCosmetic(eligible, "title-ash", id).accepted, true);
  assert.equal(buyYuanbaoCosmetic(eligible, "title-abyss", id), null);
  assert.equal(buyYuanbaoCosmetic({ ...eligible, mapBestFloors: { 1: 30, 9: 30 } }, "title-abyss", id).accepted, true);
  assert.equal(buyYuanbaoCosmetic({ ...eligible, finalBossDefeated: true }, "title-abyss", id).accepted, true);
});

test("equipped titles and appearances grant their configured combat and reward bonuses", () => {
  assert.deepEqual(equippedCosmeticBonuses("none", "none"), { experience: 0, attack: 0, defense: 0, hit: 0, dodge: 0 });
  assert.deepEqual(equippedCosmeticBonuses("ash-conqueror", "none"), { experience: 5, attack: 0, defense: 0, hit: 0, dodge: 0 });
  assert.deepEqual(equippedCosmeticBonuses("abyss-survivor", "none"), { experience: 10, attack: 10, defense: 10, hit: 0, dodge: 0 });
  assert.deepEqual(equippedCosmeticBonuses("none", "ember-aura"), { experience: 0, attack: 5, defense: 0, hit: 0, dodge: 0 });
  assert.deepEqual(equippedCosmeticBonuses("none", "arcane-aura"), { experience: 0, attack: 10, defense: 10, hit: 0, dodge: 0 });
  assert.deepEqual(equippedCosmeticBonuses("none", "abyss-aura"), { experience: 0, attack: 15, defense: 10, hit: 10, dodge: 10 });
});

test("legacy ownership survives; generic saves cannot grant cosmetics or equip unowned items", () => {
  const legacy = { ...state(), ownedTitles: ["none", "night-watcher"], selectedTitle: "night-watcher",
    ownedAppearances: ["none", "ember-aura"], selectedAppearance: "ember-aura" };
  const attempted = preserveServerShopPurchases({ ...legacy,
    ownedTitles: ["none", "abyss-survivor"], selectedTitle: "abyss-survivor",
    ownedAppearances: ["none", "abyss-aura"], selectedAppearance: "abyss-aura" }, legacy);
  assert.deepEqual(attempted.ownedTitles, ["none", "night-watcher"]);
  assert.deepEqual(attempted.ownedAppearances, ["none", "ember-aura"]);
  assert.equal(attempted.selectedTitle, "night-watcher");
  assert.equal(attempted.selectedAppearance, "ember-aura");
  const first = preserveServerShopPurchases({ ...legacy }, null);
  assert.deepEqual(first.ownedTitles, ["none"]);
  assert.deepEqual(first.ownedAppearances, ["none"]);
  assert.equal(first.selectedTitle, "none");
  assert.equal(first.selectedAppearance, "none");
});

test("generic save can select owned cosmetics while preserving purchases and receipts", () => {
  const old = { ...state(), yuanbao: 500, mapBestFloors: { 1: 30 }, ownedTitles: ["none"], ownedAppearances: ["none"] };
  const bought = buyYuanbaoCosmetic(old, "title-ash", id).save;
  const next = preserveServerShopPurchases({ ...bought, ownedTitles: ["none"],
    selectedTitle: "none", _shopPurchaseIds: [] }, bought);
  assert.deepEqual(next.ownedTitles, ["none", "ash-conqueror"]);
  assert.equal(next.selectedTitle, "none");
  assert.deepEqual(next._shopPurchaseIds, [id]);
});

test("legacy accounts keep only their highest earned title and can activate its bonus", () => {
  const server = { ...state(), legacyRebirthCount: 10,
    ownedTitles: ["none", "beta-reincarnator", "seasoned-reincarnator", "elite-reincarnator", "abyss-reincarnator"],
    selectedTitle: "beta-reincarnator" };
  const normalized = preserveServerShopPurchases({ ...server }, server);
  assert.deepEqual(normalized.ownedTitles, ["none", "abyss-reincarnator"]);
  assert.equal(normalized.selectedTitle, "abyss-reincarnator");
  const unequipped = preserveServerShopPurchases({ ...normalized, selectedTitle: "none" }, server);
  assert.equal(unequipped.selectedTitle, "none");
});

test("cosmetic purchase also cleans lower legacy titles from old saves", () => {
  const old = { ...state(), yuanbao: 6000, mapBestFloors: { 1: 30 }, legacyRebirthCount: 10,
    ownedTitles: ["none", "beta-reincarnator", "seasoned-reincarnator", "elite-reincarnator", "abyss-reincarnator"],
    ownedAppearances: ["none"], selectedTitle: "beta-reincarnator" };
  const bought = buyYuanbaoCosmetic(old, "appearance-ember", id);
  assert.deepEqual(bought.save.ownedTitles, ["none", "abyss-reincarnator"]);
  assert.equal(bought.save.selectedTitle, "abyss-reincarnator");
});
