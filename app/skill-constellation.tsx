"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SkillBuild, SkillClass, SkillDefinition } from "./skill-rework";

type Props = {
  characterClass: SkillClass;
  catalog: readonly SkillDefinition[];
  ranks: SkillBuild["ranks"];
  activeSlots: SkillBuild["activeSlots"];
  characterLevel: number;
};

type NodeData = { position: [number, number]; color: [number, number, number]; size: number };

const palettes: Record<SkillClass, { active: string; passive: string }> = {
  戰士: { active: "#efaa4b", passive: "#df6454" },
  遊俠: { active: "#b6d96c", passive: "#69c8a8" },
  法師: { active: "#c997ff", passive: "#70bcff" },
};

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
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

function program(gl: WebGLRenderingContext, vertex: string, fragment: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const result = gl.createProgram();
  if (!result) return null;
  gl.attachShader(result, vs);
  gl.attachShader(result, fs);
  gl.linkProgram(result);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    gl.deleteProgram(result);
    return null;
  }
  return result;
}

export function SkillConstellation({ characterClass, catalog, ranks, activeSlots, characterLevel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodes = useMemo<NodeData[]>(() => catalog.map((skill, index) => {
    const row = Math.floor(index / 7);
    const column = index % 7;
    const rank = ranks[skill.name] ?? 0;
    const unlocked = skill.unlockLevel <= characterLevel || rank > 0;
    const equipped = activeSlots.includes(skill.name);
    const base = palettes[characterClass][skill.kind === "active" ? "active" : "passive"];
    const color = !unlocked ? "#3f4a4a" : rank === 0 ? "#6b7370" : base;
    const factor = rank === 0 ? 0 : 0.45 + rank * 0.11;
    const [r, g, b] = rgb(color);
    return {
      position: [-0.84 + column * 0.28, 0.64 - row * 0.62],
      color: [r * Math.max(factor, 0.46), g * Math.max(factor, 0.46), b * Math.max(factor, 0.46)],
      size: equipped ? 15 : rank ? 9 + rank * 1.2 : unlocked ? 5 : 3.5,
    };
  }), [catalog, ranks, activeSlots, characterClass, characterLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true, antialias: true, depth: false, stencil: false, powerPreference: "low-power",
    });
    if (!gl) return;

    const dotProgram = program(gl, `
      attribute vec2 a_position;
      attribute vec3 a_color;
      attribute float a_size;
      uniform float u_time;
      uniform float u_motion;
      varying vec3 v_color;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        gl_PointSize = a_size * (1.0 + 0.06 * sin(u_time + a_position.x * 8.0) * u_motion);
        v_color = a_color;
      }`, `
      precision mediump float;
      varying vec3 v_color;
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float d = length(p);
        float core = 1.0 - smoothstep(0.02, 0.48, d);
        float halo = (1.0 - smoothstep(0.12, 0.5, d)) * 0.32;
        gl_FragColor = vec4(v_color, max(core, halo));
      }`);
    const lineProgram = program(gl, `
      attribute vec2 a_position;
      void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`, `
      precision mediump float;
      uniform vec4 u_color;
      void main() { gl_FragColor = u_color; }`);
    if (!dotProgram || !lineProgram) return;

    const positions = new Float32Array(nodes.flatMap((node) => node.position));
    const colors = new Float32Array(nodes.flatMap((node) => node.color));
    const sizes = new Float32Array(nodes.map((node) => node.size));
    const linePositions: number[] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const col = i % 7;
      const row = Math.floor(i / 7);
      if (col < 6 && i + 1 < nodes.length && Math.floor((i + 1) / 7) === row) {
        linePositions.push(...nodes[i].position, ...nodes[i + 1].position);
      }
      if (row < 2 && i + 7 < nodes.length) {
        linePositions.push(...nodes[i].position, ...nodes[i + 7].position);
      }
    }

    const context = gl;
    function buffer(data: Float32Array) {
      const value = context.createBuffer();
      if (!value) return null;
      context.bindBuffer(context.ARRAY_BUFFER, value);
      context.bufferData(context.ARRAY_BUFFER, data, context.STATIC_DRAW);
      return value;
    }
    const positionBuffer = buffer(positions);
    const colorBuffer = buffer(colors);
    const sizeBuffer = buffer(sizes);
    const lineBuffer = buffer(new Float32Array(linePositions));
    if (!positionBuffer || !colorBuffer || !sizeBuffer || !lineBuffer) return;

    const positionLocation = gl.getAttribLocation(dotProgram, "a_position");
    const colorLocation = gl.getAttribLocation(dotProgram, "a_color");
    const sizeLocation = gl.getAttribLocation(dotProgram, "a_size");
    const timeLocation = gl.getUniformLocation(dotProgram, "u_time");
    const motionLocation = gl.getUniformLocation(dotProgram, "u_motion");
    const linePositionLocation = gl.getAttribLocation(lineProgram, "a_position");
    const lineColorLocation = gl.getUniformLocation(lineProgram, "u_color");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let frame = 0;
    let start = 0;
    let previous = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.35);
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const draw = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      if (now - previous < 32 && !reducedMotion.matches) {
        frame = requestAnimationFrame(draw);
        return;
      }
      previous = now;
      if (!start) start = now;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(lineProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
      gl.enableVertexAttribArray(linePositionLocation);
      gl.vertexAttribPointer(linePositionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(lineColorLocation, ...rgb(palettes[characterClass].active), 0.13);
      gl.drawArrays(gl.LINES, 0, linePositions.length / 2);

      gl.useProgram(dotProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      gl.enableVertexAttribArray(colorLocation);
      gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
      gl.enableVertexAttribArray(sizeLocation);
      gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, 0, 0);
      gl.uniform1f(timeLocation, reducedMotion.matches ? 0 : (now - start) / 700);
      gl.uniform1f(motionLocation, reducedMotion.matches ? 0 : 1);
      gl.drawArrays(gl.POINTS, 0, nodes.length);
      if (!reducedMotion.matches) frame = requestAnimationFrame(draw);
    };

    const schedule = () => {
      if (visible && !document.hidden && !frame) frame = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
      else if (frame) cancelAnimationFrame(frame);
    });
    observer.observe(canvas);
    const visibility = () => document.hidden ? (frame && cancelAnimationFrame(frame), frame = 0) : schedule();
    document.addEventListener("visibilitychange", visibility);
    const motionChange = () => {
      if (reducedMotion.matches && frame) cancelAnimationFrame(frame);
      frame = 0;
      schedule();
    };
    reducedMotion.addEventListener("change", motionChange);
    schedule();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      reducedMotion.removeEventListener("change", motionChange);
      [positionBuffer, colorBuffer, sizeBuffer, lineBuffer].forEach((value) => gl.deleteBuffer(value));
      gl.deleteProgram(dotProgram);
      gl.deleteProgram(lineProgram);
    };
  }, [nodes, characterClass]);

  return <canvas className="skill-constellation" ref={canvasRef} aria-hidden="true" />;
}
