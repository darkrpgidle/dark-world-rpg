"use client";

import { useState } from "react";
import { skillDisplay } from "./skill-rework-display";
import {
  ascensionOptions, confirmSkillAscensions, selectSkillAscension, type SkillAscensionState,
} from "./skill-ascensions";
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
  onUpgrade: (name: string) => void;
  onEquip: (slot: number, name: string | null) => void;
  ascensions: SkillAscensionState;
  onSelectAscension: (tier: number, name: string) => void;
  onConfirmAscensions: () => void;
  busy: boolean;
};

export function SkillReworkPanel({ characterClass, characterLevel, build, onUpgrade, onEquip,
  ascensions, onSelectAscension, onConfirmAscensions, busy }: Props) {
  const [pendingUpgrade, setPendingUpgrade] = useState<string | null>(null);
  const catalog = SKILL_REWORK_CATALOG[characterClass];
  const available = earnedSkillPoints(characterLevel) - spentSkillPoints(build);
  const learnedActive = catalog.filter((skill) => skill.kind === "active"
    && skill.category !== "ultimate" && (build.ranks[skill.name] ?? 0) > 0);
  const ultimate = enabledUltimate(build, characterClass, characterLevel);

  return (
    <section className="panel" aria-label="新版技能配置" style={{ padding: 18, marginBottom: 20 }}>
      <h3>新版技能配置</h3>
      <p>重製配置預覽：下方舊版技能仍用於戰鬥；新版昇華目前只顯示效果，尚未提供選擇。</p>
      <p>可用技能點：<strong>{available}</strong>／已取得：{earnedSkillPoints(characterLevel)}（每 2 等 1 點）</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {build.activeSlots.map((name, index) => (
          <label key={index}>
            一般主動技能槽 {index + 1}
            <select
              aria-label={`一般主動技能槽 ${index + 1}`}
              style={{ display: "block", width: "100%", minHeight: 44 }}
              disabled={busy}
              value={name ?? ""}
              onChange={(event) => {
                const selected = event.target.value || null;
                const next = equipActiveSkill(build, characterClass, characterLevel, index, selected);
                if (next) onEquip(index, selected);
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
      <p>固定終極：{ultimate ?? (characterLevel < 50 ? "Lv50 解鎖" : "尚未投入技能點，不會施放")}</p>
      <section aria-label="新版昇華配置">
        <h4>轉生昇華（新版第 {ascensions.rebirthCount}/5 轉）</h4>
        <p>轉生後可免費重配已取得的昇華；每次確認後鎖定至下一次轉生。昇華不消耗技能點，選中的技能仍須學習與配置才會在未來新版戰鬥生效。</p>
        {ascensions.rebirthCount === 0 && <p>第一次轉生後開放基礎技能昇華。</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 }}>
          {Array.from({ length: ascensions.rebirthCount }, (_, index) => {
            const tier = index + 1;
            const options = ascensionOptions(characterClass, tier);
            const value = ascensions.choices[index];
            return <label key={tier}>
              第 {tier} 轉{tier === 5 ? "・固定終極" : "・昇華選擇"}
              <select
                aria-label={`第 ${tier} 轉昇華`}
                style={{ display: "block", width: "100%", minHeight: 44 }}
                value={value ?? ""}
                disabled={busy || !ascensions.selectionOpen || tier === 5}
                onChange={(event) => {
                  const next = selectSkillAscension(ascensions, characterClass, tier, event.target.value);
                  if (next) onSelectAscension(tier, event.target.value);
                }}
              >
                <option value="">請選擇</option>
                {options.map((name) => <option key={name} value={name}
                  disabled={(tier === 2 && ascensions.choices[2] === name) || (tier === 3 && ascensions.choices[1] === name)}>
                  {name}・{skillDisplay(characterClass, name)?.ascensionName}
                </option>)}
              </select>
              {value && <small>{skillDisplay(characterClass, value)?.ascensionEffect}</small>}
            </label>;
          })}
        </div>
        {ascensions.selectionOpen && <button className="btn btn-ghost" style={{ minHeight: 44, marginTop: 12 }}
          disabled={busy || ascensions.choices.slice(0, ascensions.rebirthCount).some((value) => value === null)}
          onClick={() => {
            const next = confirmSkillAscensions(ascensions, characterClass);
            if (next) onConfirmAscensions();
          }}>確認昇華配置</button>}
        <p>付費技能重置待元寶價格、重置卷道具及伺服器扣款規則定案後開放。</p>
      </section>
      {(["active", "passive"] as const).map((kind) => (
        <div key={kind}>
          <h4>{kind === "active" ? "主動技能" : "被動技能"}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
            {catalog.filter((skill) => skill.kind === kind).map((skill) => {
              const rank = build.ranks[skill.name] ?? 0;
              const locked = characterLevel < skill.unlockLevel;
              const display = skillDisplay(characterClass, skill.name);
              const pendingKey = `${characterClass}:${skill.name}`;
              return (
                <article className="panel skill-card" key={skill.name} style={{ padding: 12 }}>
                  <div>
                    <small>{skill.category === "ultimate" ? "固定終極" : kind === "passive" ? "投入後自動生效" : "可配置主動"}</small>
                    <h5>{skill.name}</h5>
                    <p>角色 Lv{skill.unlockLevel} 解鎖 · 技能 Lv{rank}/5</p>
                    <p>{locked ? "尚未解鎖" : rank ? kind === "passive" ? "已生效" : skill.category === "ultimate" ? "已啟用固定終極" : build.activeSlots.includes(skill.name) ? "已裝備" : "已學習，未裝備" : "尚未投入技能點"}</p>
                    {display && (
                      <details>
                        <summary style={{ cursor: "pointer", minHeight: 44, paddingTop: 10 }}>查看 Lv1～5 數值與效果</summary>
                        {display.fixed.map((value) => <p key={value}>{value}</p>)}
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", minWidth: 330, borderCollapse: "collapse", textAlign: "left" }}>
                            <thead><tr><th scope="col">效果</th>{[1, 2, 3, 4, 5].map((n) => <th scope="col" key={n}>Lv{n}</th>)}</tr></thead>
                            <tbody>{display.ranks.map((entry) => (
                              <tr key={entry.label}><th scope="row">{entry.label}</th>{entry.values.map((value, i) => <td key={i} style={{ fontWeight: rank === i + 1 ? 700 : undefined }}>{value}</td>)}</tr>
                            ))}</tbody>
                          </table>
                        </div>
                        {display.ascensionName && <p>昇華預覽・{display.ascensionName}：{display.ascensionEffect}</p>}
                      </details>
                    )}
                  </div>
                  {pendingUpgrade === pendingKey ? (
                    <div>
                      <p role="status">確定消耗 1 點技能點，將「{skill.name}」升至 Lv{rank + 1}？目前剩餘 {available} 點。</p>
                      <button className="btn btn-ghost" style={{ minHeight: 44 }} disabled={busy || locked || rank >= 5 || available < 1} onClick={() => {
                        const next = upgradeSkill(build, characterClass, characterLevel, skill.name);
                        if (next) onUpgrade(skill.name);
                        setPendingUpgrade(null);
                      }}>確認升級</button>
                      <button className="btn btn-ghost" style={{ minHeight: 44 }} onClick={() => setPendingUpgrade(null)}>取消</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" style={{ minHeight: 44 }} disabled={busy || locked || rank >= 5 || available < 1}
                      onClick={() => setPendingUpgrade(pendingKey)}>
                      {locked ? `Lv${skill.unlockLevel} 解鎖` : rank >= 5 ? "已滿級" : rank === 0 ? "學習 · 1 點" : "升級 · 1 點"}
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
