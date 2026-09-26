"use client";

import { useState } from "react";
import {
  SKILL_REWORK_CATALOG,
  earnedSkillPoints,
  enabledUltimate,
  equipActiveSkill,
  spentSkillPoints,
  upgradeSkill,
  type SkillBuild,
  type SkillClass,
} from "./skill-rework";

type Props = {
  characterClass: SkillClass;
  characterLevel: number;
  build: SkillBuild;
  onChange: (build: SkillBuild) => void;
};

export function SkillReworkPanel({ characterClass, characterLevel, build, onChange }: Props) {
  const [pendingUpgrade, setPendingUpgrade] = useState<string | null>(null);
  const catalog = SKILL_REWORK_CATALOG[characterClass];
  const available = earnedSkillPoints(characterLevel) - spentSkillPoints(build);
  const learnedActive = catalog.filter((skill) => skill.kind === "active"
    && skill.category !== "ultimate" && (build.ranks[skill.name] ?? 0) > 0);
  const ultimate = enabledUltimate(build, characterClass, characterLevel);

  return (
    <section className="panel" aria-label="新版技能配置" style={{ padding: 18, marginBottom: 20 }}>
      <h3>新版技能配置</h3>
      <p>重製預覽：目前戰鬥仍使用下方舊版技能。新版配置會獨立儲存，待技能系統完成後啟用。</p>
      <p>可用技能點：<strong>{available}</strong>／已取得：{earnedSkillPoints(characterLevel)}（每 2 等 1 點）</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {build.activeSlots.map((name, index) => (
          <label key={index}>
            一般主動技能槽 {index + 1}
            <select
              aria-label={`一般主動技能槽 ${index + 1}`}
              value={name ?? ""}
              onChange={(event) => {
                const selected = event.target.value || null;
                const next = equipActiveSkill(build, characterClass, characterLevel, index, selected);
                if (next) onChange(next);
              }}
            >
              <option value="">未配置</option>
              {learnedActive.map((skill) => (
                <option key={skill.name} value={skill.name}
                  disabled={build.activeSlots.some((slot, slotIndex) => slotIndex !== index && slot === skill.name)}>
                  {skill.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p>固定終極：{ultimate ?? (characterLevel < 50 ? "Lv50 解鎖" : "尚未投入技能點")}</p>
      {(["active", "passive"] as const).map((kind) => (
        <div key={kind}>
          <h4>{kind === "active" ? "主動技能" : "被動技能"}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {catalog.filter((skill) => skill.kind === kind).map((skill) => {
              const rank = build.ranks[skill.name] ?? 0;
              const locked = characterLevel < skill.unlockLevel;
              return (
                <article className="panel skill-card" key={skill.name} style={{ padding: 12 }}>
                  <div>
                    <small>{skill.category === "ultimate" ? "固定終極" : kind === "passive" ? "投入後自動生效" : "可配置主動"}</small>
                    <h5>{skill.name}</h5>
                    <p>角色 Lv{skill.unlockLevel} 解鎖 · 技能 Lv{rank}/5</p>
                  </div>
                  {pendingUpgrade === skill.name ? (
                    <div>
                      <p>確定消耗 1 點技能點，升級「{skill.name}」？</p>
                      <button className="btn btn-ghost" onClick={() => {
                        const next = upgradeSkill(build, characterClass, characterLevel, skill.name);
                        if (next) onChange(next);
                        setPendingUpgrade(null);
                      }}>確認升級</button>
                      <button className="btn btn-ghost" onClick={() => setPendingUpgrade(null)}>取消</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" disabled={locked || rank >= 5 || available < 1}
                      onClick={() => setPendingUpgrade(skill.name)}>
                      {locked ? `Lv${skill.unlockLevel} 解鎖` : rank === 0 ? "學習 · 1 點" : "升級 · 1 點"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
