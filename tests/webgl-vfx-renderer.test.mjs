import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/webgl-vfx-renderer.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext } }).outputText;
const { WebGLVfxRenderer } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

// Capture the renderer/GPU contract without requiring a GPU in the build container.
function rendererFixture() {
  const state = { uniforms: new Map(), pixels: new Map(), vertices: [], blend: [] };
  const handlers = {
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: () => 0, getUniformLocation: (_, name) => name,
    bufferData: (_, data) => { state.vertices = [...data]; },
    pixelStorei: (key, value) => state.pixels.set(key, value),
    uniform4f: (key, ...value) => state.uniforms.set(key, value),
    uniform1f: (key, value) => state.uniforms.set(key, value),
    blendFuncSeparate: (...value) => { state.blend = value; },
  };
  const gl = new Proxy({}, { get: (_, key) => {
    if (handlers[key]) return handlers[key];
    if (String(key).startsWith("create")) return () => ({});
    if (/^[A-Z_0-9]+$/.test(String(key))) return key;
    return () => {};
  } });
  const canvas = { getContext: (_, options) => { state.contextOptions = options; return gl; },
    getBoundingClientRect: () => ({ width: 300, height: 330 }) };
  return { renderer: new WebGLVfxRenderer(canvas), state };
}

test("sprite atlas row and orientation match the top-left Canvas fallback convention", () => {
  const { renderer, state } = rendererFixture();
  const atlas = { complete: true, naturalWidth: 200, naturalHeight: 200 };
  renderer.sprite(atlas, 0, 0, 100, 100, 1, false, [0, 0.5, 0.5, 0.5]);
  // Four quadrants stand for visually distinct animation frames.
  const colors = [["red", "green"], ["blue", "gold"]];
  const [u, v, du, dv] = state.uniforms.get("u_uv_rect");
  const vertexTop = Math.min(...state.vertices.filter((_, i) => i % 2 === 1));
  const sampleY = v + (vertexTop + 0.1) * dv;
  const textureY = state.pixels.get("UNPACK_FLIP_Y_WEBGL") ? 1 - sampleY : sampleY;
  assert.equal(colors[Math.floor(textureY * 2)][Math.floor((u + du * 0.1) * 2)], "blue");
  assert.ok(textureY < v + dv / 2, "top of the selected frame must stay at the top");
});

test("semi-transparent painted sprites retain their coverage instead of squaring alpha", () => {
  const { renderer, state } = rendererFixture();
  renderer.sprite({ complete: true, naturalWidth: 10, naturalHeight: 10 }, 0, 0, 10, 10, 0.5);
  const alpha = state.uniforms.get("u_color")[3];
  const factor = state.blend[2] === "ONE" ? 1 : alpha;
  assert.equal(alpha * factor, 0.5);
  assert.equal(state.blend[3], "ONE_MINUS_SRC_ALPHA");
  assert.equal(state.contextOptions.premultipliedAlpha, true,
    "the browser must not multiply already blended RGB by alpha a second time");
});

test('rotated sprite remains in texture mode and passes angle to the vertex shader',()=>{
 const {renderer,state}=rendererFixture();
 renderer.sprite({complete:true,naturalWidth:512},0,0,100,30,1,false,[0,0,1,1],2.2);
 assert.equal(state.uniforms.get('u_mode'),0);
 assert.equal(state.uniforms.get('u_rotation'),2.2);
});
