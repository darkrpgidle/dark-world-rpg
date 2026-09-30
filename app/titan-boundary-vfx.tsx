"use client";

import { useEffect, useRef } from "react";

const SOURCE = "/vfx/titan-boundary/sheet.png";
const DURATION = 1_750;
const FRAME_COUNT = 8;
const COLUMNS = 4;
const ROWS = 2;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_uv = a_uv;
    }
  `);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D u_sheet;
    uniform vec2 u_frame;
    uniform vec2 u_texel;
    uniform float u_time;
    uniform float u_impact;
    uniform float u_opacity;
    varying vec2 v_uv;
    void main() {
      vec2 cellOrigin = vec2(u_frame.x / 4.0, u_frame.y / 2.0);
      vec2 cellSize = vec2(0.25, 0.5);
      vec2 warp = vec2(
        sin(u_time * 10.0 + v_uv.y * 18.0),
        cos(u_time * 8.0 + v_uv.x * 15.0)
      ) * (0.0015 + u_impact * 0.003);
      vec2 localUv = clamp(v_uv + warp, u_texel * 0.5 / cellSize, vec2(1.0) - u_texel * 0.5 / cellSize);
      vec2 uv = cellOrigin + localUv * cellSize;
      vec4 base = texture2D(u_sheet, uv);
      vec2 stepUv = u_texel * 1.35;
      float halo = max(max(texture2D(u_sheet, uv + vec2(stepUv.x, 0.0)).a,
                           texture2D(u_sheet, uv - vec2(stepUv.x, 0.0)).a),
                       max(texture2D(u_sheet, uv + vec2(0.0, stepUv.y)).a,
                           texture2D(u_sheet, uv - vec2(0.0, stepUv.y)).a));
      halo = max(0.0, halo - base.a) * u_impact;
      vec3 rgb = min(vec3(1.0), base.rgb + vec3(0.82, 0.10, 0.025) * halo * 0.9);
      float alpha = max(base.a, halo * 0.34) * u_opacity;
      gl_FragColor = vec4(rgb, alpha);
    }
  `);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function impactShake(stage: HTMLElement, amount: number) {
  stage.animate([
    { transform: "translate3d(0,0,0) rotate(0deg)", filter: "brightness(1)" },
    { transform: "translate3d(" + -amount + "px," + amount * 0.28 + "px,0) rotate(-0.65deg)", filter: "brightness(1.42)" },
    { transform: "translate3d(" + amount * 0.82 + "px," + -amount * 0.24 + "px,0) rotate(0.48deg)", filter: "brightness(1.12)" },
    { transform: "translate3d(" + -amount * 0.56 + "px," + amount * 0.16 + "px,0) rotate(-0.3deg)", filter: "brightness(1.06)" },
    { transform: "translate3d(" + amount * 0.25 + "px," + -amount * 0.08 + "px,0) rotate(0.12deg)", filter: "brightness(1.02)" },
    { transform: "translate3d(0,0,0) rotate(0deg)", filter: "brightness(1)" },
  ], { duration: 620, easing: "cubic-bezier(.16,.76,.26,1)" });
}

function frameBounds(frameIndex: number, playerX: number, playerY: number, enemyX: number, enemyY: number, stageWidth: number, stageHeight: number, progress: number) {
  const moving = frameIndex === 2;
  const followThrough = frameIndex === 5 || frameIndex === 6;
  const centerX = moving
    ? playerX + (enemyX - playerX) * Math.min(1, Math.max(0, (progress - 0.25) / 0.125))
    : frameIndex < 2
      ? playerX
      : followThrough
        ? enemyX - stageWidth * 0.08
        : enemyX;
  const centerY = frameIndex < 2 ? playerY : enemyY;
  const w = frameIndex === 2 ? stageWidth * 1.14
    : frameIndex === 3 || frameIndex === 4 ? stageWidth * 0.86
      : frameIndex === 7 ? stageWidth * 0.78
        : stageWidth * 0.82;
  const h = frameIndex === 2 ? stageHeight * 1.08
    : frameIndex === 3 || frameIndex === 4 ? stageHeight * 1.22
      : stageHeight * 1.04;
  return { x: centerX - w / 2, y: centerY - h / 2, w, h };
}

export function TitanBoundaryVfx({ effectKey }: { effectKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.closest<HTMLElement>(".battle-stage");
    if (!canvas || !stage) return;

    const sheet = new Image();
    sheet.src = SOURCE;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    const context2d = gl ? null : canvas.getContext("2d");
    let animationFrame = 0;
    let startedAt = 0;
    let didShake = false;
    let disposed = false;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    let shaderProgram: WebGLProgram | null = null;
    let positionLocation = -1;
    let uvLocation = -1;
    let textureLocation: WebGLUniformLocation | null = null;
    let frameLocation: WebGLUniformLocation | null = null;
    let texelLocation: WebGLUniformLocation | null = null;
    let timeLocation: WebGLUniformLocation | null = null;
    let impactLocation: WebGLUniformLocation | null = null;
    let opacityLocation: WebGLUniformLocation | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      if (gl) gl.viewport(0, 0, width, height);
      if (context2d) context2d.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const setupWebGl = () => {
      if (!gl) return;
      shaderProgram = createProgram(gl);
      if (!shaderProgram) return;
      buffer = gl.createBuffer();
      texture = gl.createTexture();
      if (!buffer || !texture) return;

      gl.useProgram(shaderProgram);
      positionLocation = gl.getAttribLocation(shaderProgram, "a_position");
      uvLocation = gl.getAttribLocation(shaderProgram, "a_uv");
      textureLocation = gl.getUniformLocation(shaderProgram, "u_sheet");
      frameLocation = gl.getUniformLocation(shaderProgram, "u_frame");
      texelLocation = gl.getUniformLocation(shaderProgram, "u_texel");
      timeLocation = gl.getUniformLocation(shaderProgram, "u_time");
      impactLocation = gl.getUniformLocation(shaderProgram, "u_impact");
      opacityLocation = gl.getUniformLocation(shaderProgram, "u_opacity");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.enableVertexAttribArray(uvLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet);
      gl.uniform1i(textureLocation, 0);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
    };

    const render = (time: number) => {
      if (disposed) return;
      if (!startedAt) startedAt = time;
      resize();
      const elapsed = time - startedAt;
      const progress = reducedMotion ? 0.52 : Math.min(1, elapsed / DURATION);
      const frameIndex = reducedMotion ? 3 : Math.min(FRAME_COUNT - 1, Math.floor(progress * FRAME_COUNT));
      const canvasRect = canvas.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const player = stage.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = stage.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const playerX = player ? player.left + player.width / 2 - canvasRect.left : canvasRect.width * 0.3;
      const playerY = player ? player.top + player.height / 2 - canvasRect.top : canvasRect.height * 0.5;
      const enemyX = enemy ? enemy.left + enemy.width / 2 - canvasRect.left : canvasRect.width * 0.71;
      const enemyY = enemy ? enemy.top + enemy.height / 2 - canvasRect.top : canvasRect.height * 0.5;
      const bounds = frameBounds(frameIndex, playerX, playerY, enemyX, enemyY, stageRect.width, stageRect.height, progress);
      const impact = frameIndex >= 3 ? Math.max(0, 1 - Math.abs(progress - 0.5) * 2.1) : 0;
      const opacity = progress > 0.9 ? Math.max(0, (1 - progress) / 0.1) : 1;

      if (frameIndex >= 3 && !didShake && !reducedMotion) {
        didShake = true;
        impactShake(stage, Math.max(14, Math.min(26, stageRect.width * 0.04)));
      }

      if (gl && shaderProgram && texture && buffer && sheet.complete && sheet.naturalWidth > 0) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(shaderProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const left = (bounds.x / canvasRect.width) * 2 - 1;
        const right = ((bounds.x + bounds.w) / canvasRect.width) * 2 - 1;
        const top = 1 - (bounds.y / canvasRect.height) * 2;
        const bottom = 1 - ((bounds.y + bounds.h) / canvasRect.height) * 2;
        const uv = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];
        const points = [left, bottom, ...uv.slice(0, 2), right, bottom, ...uv.slice(2, 4), left, top, ...uv.slice(4, 6),
          left, top, ...uv.slice(6, 8), right, bottom, ...uv.slice(8, 10), right, top, ...uv.slice(10, 12)];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
        gl.uniform2f(frameLocation, frameIndex % COLUMNS, 1 - Math.floor(frameIndex / COLUMNS));
        gl.uniform2f(texelLocation, 1 / sheet.naturalWidth, 1 / sheet.naturalHeight);
        gl.uniform1f(timeLocation, elapsed / 1000);
        gl.uniform1f(impactLocation, impact);
        gl.uniform1f(opacityLocation, opacity);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else if (context2d && sheet.complete && sheet.naturalWidth > 0) {
        context2d.clearRect(0, 0, canvasRect.width, canvasRect.height);
        const cellWidth = sheet.naturalWidth / COLUMNS;
        const cellHeight = sheet.naturalHeight / ROWS;
        context2d.save();
        context2d.globalAlpha = opacity;
        context2d.globalCompositeOperation = "screen";
        context2d.filter = "drop-shadow(0 0 18px rgba(255, 28, 22, .9))";
        context2d.drawImage(sheet, (frameIndex % COLUMNS) * cellWidth, Math.floor(frameIndex / COLUMNS) * cellHeight, cellWidth, cellHeight,
          bounds.x, bounds.y, bounds.w, bounds.h);
        context2d.restore();
      }

      if (!reducedMotion && elapsed < DURATION) animationFrame = requestAnimationFrame(render);
    };

    resize();
    if (gl) {
      sheet.onload = setupWebGl;
      if (sheet.complete && sheet.naturalWidth > 0) setupWebGl();
    }
    animationFrame = requestAnimationFrame(render);
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      if (gl) {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (shaderProgram) gl.deleteProgram(shaderProgram);
      }
    };
  }, [effectKey]);

  return <canvas ref={canvasRef} className="titan-boundary-vfx-canvas" aria-hidden="true" />;
}
