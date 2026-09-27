import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("/app/") && specifier.startsWith("./") && !specifier.endsWith(".ts"))
    return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { buyYuanbaoCosmetic, buyYuanbaoReforgeBundle, cosmeticSku, preserveServerShopPurchases } = await import("../app/shop-purchase.ts");
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
  ["title-ash", 80, "ownedTitles", "selectedTitle", "ash-conqueror"],
  ["title-abyss", 180, "ownedTitles", "selectedTitle", "abyss-survivor"],
  ["appearance-ember", 120, "ownedAppearances", "selectedAppearance", "ember-aura"],
  ["appearance-arcane", 180, "ownedAppearances", "selectedAppearance", "arcane-aura"],
  ["appearance-abyss", 300, "ownedAppearances", "selectedAppearance", "abyss-aura"],
];

test("all five cosmetic SKUs atomically deduct their price and unlock the correct item", () => {
  for (const [sku, price, field, selected, ownedId] of cosmeticCases) {
    const legacy = { ...state(), yuanbao: 400, ownedTitles: ["none", "night-watcher"],
      ownedAppearances: ["none"], selectedTitle: "night-watcher" };
    const bought = buyYuanbaoCosmetic(legacy, sku, id);
    assert.equal(bought.accepted, true, sku);
    assert.equal(bought.save.yuanbao, 400 - price, sku);
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
  const old = { ...state(), yuanbao: 500, ownedTitles: ["none"], ownedAppearances: ["none"] };
  const bought = buyYuanbaoCosmetic(old, "title-ash", id).save;
  const next = preserveServerShopPurchases({ ...bought, ownedTitles: ["none"],
    selectedTitle: "none", _shopPurchaseIds: [] }, bought);
  assert.deepEqual(next.ownedTitles, ["none", "ash-conqueror"]);
  assert.equal(next.selectedTitle, "none");
  assert.deepEqual(next._shopPurchaseIds, [id]);
});
