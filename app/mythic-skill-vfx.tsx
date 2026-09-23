"use client";

import { useEffect, useRef } from "react";
import { SkillEffectCanvas } from "./skill-effect-canvas";

export type MythicVfxPhase = "cast" | "impact" | "loop" | "echo";
type MythicSkillVfxProps = { skill: string; effectKey: number; phase?: MythicVfxPhase; variant?: "normal" | "detonation" };

function ArcaneEchoVfx({ effectKey }: { effectKey: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stage = root.closest(".battle-stage");
    const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .enemy-frame");
    const overlay = root.getBoundingClientRect();
    const target = enemy?.getBoundingClientRect();
    if (target) {
      root.style.setProperty("--arcane-echo-x", `${target.left - overlay.left + target.width / 2}px`);
      root.style.setProperty("--arcane-echo-y", `${target.top - overlay.top + target.height / 2}px`);
      root.style.setProperty("--arcane-echo-size", `${Math.max(target.width, target.height) * 1.35}px`);
    }
    root.classList.remove("vfx-replay");
    void root.offsetWidth;
    root.classList.add("vfx-replay");
    return () => root.classList.remove("vfx-replay");
  }, [effectKey]);

  return <div ref={rootRef} className="mythic-skill-vfx arcane-echo-vfx" aria-hidden="true">
    {Array.from({ length: 16 }, (_, frame) => <span key={frame} className={`arcane-echo-frame arcane-echo-frame-${frame + 1}`} />)}
    <span className="arcane-echo-aura" />
  </div>;
}

export function MythicSkillVfx({ skill, effectKey, phase = "impact", variant = "normal" }: MythicSkillVfxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isFrostfire = skill === "霜火新星";
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (skill === "隕星術") {
      const stage = root.closest(".battle-stage");
      const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .enemy-frame");
      const overlay = root.getBoundingClientRect();
      const target = enemy?.getBoundingClientRect();
      if (target) {
        root.style.setProperty("--meteor-impact-x", `${target.left - overlay.left + target.width / 2}px`);
        root.style.setProperty("--meteor-impact-y", `${target.top - overlay.top + target.height / 2}px`);
      }
    }
    root.classList.remove("vfx-replay");
    void root.offsetWidth;
    root.classList.add("vfx-replay");
    return () => root.classList.remove("vfx-replay");
  }, [effectKey, phase, skill, variant]);
  if (skill === "奧術回響") return <ArcaneEchoVfx effectKey={effectKey} />;
  if (skill === "隕星術") return <div ref={rootRef} className="mythic-skill-vfx meteor-vfx" aria-hidden="true">
    <span className="meteor-vfx-layer meteor-vfx-flight">
      {Array.from({ length: 6 }, (_, frame) => <span key={frame} className="meteor-vfx-frame" />)}
    </span>
    <span className="meteor-vfx-layer meteor-vfx-ring">
      {Array.from({ length: 4 }, (_, frame) => <span key={frame} className="meteor-vfx-frame" />)}
    </span>
    <span className="meteor-vfx-layer meteor-vfx-blast">
      {Array.from({ length: 8 }, (_, frame) => <span key={frame} className="meteor-vfx-frame" />)}
    </span>
    <span className="meteor-vfx-sparks" />
  </div>;
  if (isFrostfire) return <div ref={rootRef} className={`mythic-skill-vfx frostfire-vfx ${variant === "detonation" ? "frostfire-vfx-detonation" : "frostfire-vfx-flight"}`} aria-hidden="true">
    {variant === "detonation" ? (
      <>
        <span className="frostfire-vfx-sprite frostfire-vfx-burst"><span className="frostfire-vfx-frame frostfire-vfx-frame-a" /><span className="frostfire-vfx-frame frostfire-vfx-frame-b" /></span>
        <span className="frostfire-vfx-sprite frostfire-vfx-dissipate"><span className="frostfire-vfx-frame frostfire-vfx-frame-a" /><span className="frostfire-vfx-frame frostfire-vfx-frame-b" /></span>
      </>
    ) : (
      <>
        <span className="frostfire-vfx-sprite frostfire-vfx-charge"><span className="frostfire-vfx-frame frostfire-vfx-frame-a" /><span className="frostfire-vfx-frame frostfire-vfx-frame-b" /></span>
        <span className="frostfire-vfx-sprite frostfire-vfx-projectile"><span className="frostfire-vfx-frame frostfire-vfx-frame-a" /><span className="frostfire-vfx-frame frostfire-vfx-frame-b" /></span>
        <span className="frostfire-vfx-sprite frostfire-vfx-hit"><span className="frostfire-vfx-frame frostfire-vfx-frame-a" /><span className="frostfire-vfx-frame frostfire-vfx-frame-b" /></span>
        <span className="frostfire-vfx-sprite frostfire-vfx-burst"><span className="frostfire-vfx-frame frostfire-vfx-frame-a" /><span className="frostfire-vfx-frame frostfire-vfx-frame-b" /></span>
        <span className="frostfire-vfx-sprite frostfire-vfx-dissipate"><span className="frostfire-vfx-frame frostfire-vfx-frame-a" /><span className="frostfire-vfx-frame frostfire-vfx-frame-b" /></span>
      </>
    )}
  </div>;
  return <SkillEffectCanvas name={skill} effectKey={effectKey} />;
}
