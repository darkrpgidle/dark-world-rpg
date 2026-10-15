import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import ts from "typescript";

// Run the production callbacks through React's real client dispatcher. The
// combat timer batches a state update followed by a functional updater; the
// latter runs during rendering and cannot invoke an Effect Event.
const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const initializers = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && ["triggerHunterBurst", "updateHunterVisual"].includes(node.name.text)) {
    initializers.set(node.name.text, node.initializer.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(initializers.size, 2);
const compiled = ts.transpileModule([
  ...[...initializers].map(([name, initializer]) => `const ${name} = ${initializer};`),
  "return updateHunterVisual;",
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const createCallback = new Function("useCallback", "useEffectEvent", "setHunterMarkVisual", "setHunterBursts",
  "pendingHunterBurstRef", compiled);

async function run({ characterClass = "遊俠", action, invalidHook = false } = {}) {
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const doc = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
  const win = { document: doc, event: undefined, HTMLIFrameElement: class {}, addEventListener() {}, removeEventListener() {} };
  doc.defaultView = win; globalThis.window = win; globalThis.document = doc;
  const container = { nodeType: 1, ownerDocument: doc, tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml",
    addEventListener() {}, removeEventListener() {}, textContent: "" };
  const errors = []; let fire, result;
  function Combat() {
    const [count, setCount] = React.useState(0);
    const [mark, setMark] = React.useState(null), [bursts, setBursts] = React.useState([]);
    const pending = React.useRef(new Map());
    const callback = createCallback(invalidHook ? React.useEffectEvent : React.useCallback,
      React.useEffectEvent, setMark, setBursts, pending);
    fire = () => {
      setCount(1);
      setCount((value) => { callback({ characterClass }, action ?? { hunterMark: null, hunterExplosion: null }, 42); return value + 1; });
    };
    result = { count, mark, bursts, queued: pending.current.size };
    return null;
  }
  const root = createRoot(container, { onUncaughtError: (error) => errors.push(error.message) });
  try {
    await React.act(async () => { flushSync(() => root.render(React.createElement(Combat))); });
    try { await React.act(async () => { flushSync(() => fire()); }); }
    catch (error) { errors.push(error.message); }
    return { errors, result };
  } finally {
    await React.act(async () => { flushSync(() => root.unmount()); });
    await new Promise((resolve) => setImmediate(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}

test("regression reproduces React black screen guard with an Effect Event inside combat updater", async () => {
  assert.match((await run({ invalidHook: true })).errors[0], /useEffectEvent can't be called during rendering/);
});
for (const characterClass of ["戰士", "遊俠", "法師"]) test(`${characterClass} combat updater stays mounted with production callback`, async () => {
  const { errors, result } = await run({ characterClass });
  assert.deepEqual(errors, []); assert.equal(result.count, 2);
});
test("ranger mark and zero-damage burst update safely within real React state updater", async () => {
  const { errors, result } = await run({ action: {
    hunterMark: { expiresAt: 8000, criticals: 3, pending: true, ascended: true, activated: true, criticalHit: false },
    hunterExplosion: { hit: false }, damagePercent: 0,
  } });
  assert.deepEqual(errors, []); assert.equal(result.mark.castKey, 42);
  assert.deepEqual(result.bursts, [{ key: 42, hit: false }]); assert.equal(result.queued, 0);
});
