import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("/app/") && specifier.startsWith("./") && !specifier.endsWith(".ts"))
    return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { buyYuanbaoReforgeBundle, preserveServerShopPurchases } = await import("../app/shop-purchase.ts");
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
