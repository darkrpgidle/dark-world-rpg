"use client";
import { WebGLBloodRoarVfx } from "./webgl-blood-roar-vfx";
export function BloodRoarBuffVfx({ active }: { active: boolean }) {
  return active ? <WebGLBloodRoarVfx aura /> : null;
}
