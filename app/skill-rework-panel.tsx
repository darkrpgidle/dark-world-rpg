"use client";

import { useEffect, useState } from "react";
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
  type SkillDefinition,
} from "./skill-rework";
import { SkillConstellation } from "./skill-constellation";

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

const categoryNames: Record<string, string> = {
  basic: "基礎", defense: "防禦", status: "狀態", burst: "爆發", mechanic: "機制", ultimate: "終極",
};

export function SkillReworkPanel({ characterClass, characterLevel, build, onUpgrade, onEquip,
  ascensions, onSelectAscension, onConfirmAscensions, busy }: Props) {
  const [pendingUpgrade, setPendingUpgrade] = useState<string | null>(null);
  const [pendingAscensionConfirmation, setPendingAscensionConfirmation] = useState(false);
  const [kind, setKind] = useState<"active" | "passive">("active");
  useEffect(() => {
    setPendingAscensionConfirmation(false);
    setPendingUpgrade(null);
  }, [characterClass, ascensions.rebirthCount, ascensions.selectionOpen]);

  const catalog = SKILL_REWORK_CATALOG[characterClass];
  const available = earnedSkillPoints(characterLevel) - spentSkillPoints(build);
  const earned = earnedSkillPoints(characterLevel);
  const spent = spentSkillPoints(build);
  const learnedActive = catalog.filter((skill) => skill.kind === "active"
    && skill.category !== "ultimate" && (build.ranks[skill.name] ?? 0) > 0);
  const ultimateSkill = catalog.find((skill) => skill.category === "ultimate");
  const ultimate = enabledUltimate(build, characterClass, characterLevel);
  const currentSkills = catalog.filter((skill) => skill.kind === kind);
  const learnedCount = currentSkills.filter((skill) => (build.ranks[skill.name] ?? 0) > 0).length;
  const confirmedAscensions = ascensions.choices.slice(0, ascensions.rebirthCount)
    .filter((choice) => choice !== null).length;

  return (
    <section className="skill-workbench" aria-label="技能配置">
      <div className="skill-overview">
        <SkillConstellation characterClass={characterClass} catalog={catalog} ranks={build.ranks}
          activeSlots={build.activeSlots} characterLevel={characterLevel} />
        <div className="skill-overview-content">
          <div className="skill-overview-stats">
            <div>
              <p className="skill-eyebrow">技能點數</p>
              <div className="skill-point-line">
                <strong>{available}</strong><span>可用</span>
                <span className="skill-point-divider">/</span>
                <span>{earned} 點</span>
              </div>
              <div className="skill-point-meter" role="progressbar" aria-label="已投入技能點"
                aria-valuemin={0} aria-valuemax={Math.max(earned, 1)} aria-valuenow={spent}>
                <span style={{ width: `${earned ? (spent / earned) * 100 : 0}%` }} />
              </div>
              <p className="skill-overview-note">已投入 {spent} 點 <i /> 角色 Lv{characterLevel}</p>
            </div>
            <div className="skill-state-summary">
              <span><b>{learnedActive.length}</b><small>已學戰技</small></span>
              <span><b>{confirmedAscensions}/{Math.min(ascensions.rebirthCount, 5)}</b><small>已選昇華</small></span>
              <span><b>{ultimate ? "啟用" : characterLevel >= 50 ? "待學" : "Lv50"}</b><small>固定終極</small></span>
            </div>
          </div>

          <div className="skill-loadout">
            <div className="skill-section-label"><span>出戰配置</span><small>最多三招</small></div>
            <div className="skill-loadout-slots">
              {build.activeSlots.map((name, index) => (
                <label className={name ? "skill-loadout-slot equipped" : "skill-loadout-slot"} key={index}>
                  <span className="skill-slot-number">0{index + 1}</span>
                  <select
                    aria-label={`一般主動技能槽 ${index + 1}`}
                    disabled={busy}
                    value={name ?? ""}
                    onChange={(event) => {
                      const selected = event.target.value || null;
                      if (equipActiveSkill(build, characterClass, characterLevel, index, selected)) onEquip(index, selected);
                    }}
                  >
                    <option value="">選擇技能</option>
                    {learnedActive.map((skill) => (
                      <option key={skill.name} value={skill.name}
                        disabled={build.activeSlots.some((slot, slotIndex) => slotIndex !== index && slot === skill.name)}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                  <span className="skill-slot-check" aria-hidden="true">{name ? "✦" : "＋"}</span>
                </label>
              ))}
              {ultimateSkill && (
                <div className={ultimate ? "skill-loadout-slot skill-ultimate-slot equipped" : "skill-loadout-slot skill-ultimate-slot"}>
                  <span className="skill-slot-number">終</span>
                  <span className="skill-ultimate-name">{ultimateSkill.name}</span>
                  <span className="skill-slot-check" aria-hidden="true">✦</span>
                  <small>{ultimate ? `Lv${build.ranks[ultimateSkill.name]}/5` : characterLevel >= 50 ? "投入技能點啟用" : "Lv50 解鎖"}</small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <details className="skill-ascension">
        <summary>
          <span className="skill-ascension-title">輪迴昇華</span>
          <span className="skill-ascension-state">
            {ascensions.rebirthCount ? `${confirmedAscensions} / ${Math.min(ascensions.rebirthCount, 5)} 已選` : "第 1 轉解鎖"}
          </span>
        </summary>
        <div className="skill-ascension-body">
          <p className="skill-compact-note">每轉選一項；確認後鎖定至下次轉生，不消耗技能點。</p>
          {ascensions.rebirthCount === 0 ? (
            <div className="skill-ascension-locked">完成第 1 次轉生後即可選擇技能昇華。</div>
          ) : (
            <>
              <div className="skill-ascension-grid">
                {Array.from({ length: Math.min(ascensions.rebirthCount, 5) }, (_, index) => {
                  const tier = index + 1;
                  const options = ascensionOptions(characterClass, tier);
                  const value = ascensions.choices[index];
                  return (
                    <label className="skill-ascension-choice" key={tier}>
                      <span>第 {tier} 轉{tier === 5 ? "・終極" : ""}</span>
                      <select
                        aria-label={`第 ${tier} 轉昇華`}
                        value={value ?? ""}
                        disabled={busy || !ascensions.selectionOpen || tier === 5}
                        onChange={(event) => {
                          const next = selectSkillAscension(ascensions, characterClass, tier, event.target.value);
                          if (next) {
                            setPendingAscensionConfirmation(false);
                            onSelectAscension(tier, event.target.value);
                          }
                        }}
                      >
                        <option value="">選擇昇華</option>
                        {options.map((name) => (
                          <option key={name} value={name}
                            disabled={(tier === 2 && ascensions.choices[2] === name)
                              || (tier === 3 && ascensions.choices[1] === name)}>
                            {name}・{skillDisplay(characterClass, name)?.ascensionName}
                          </option>
                        ))}
                      </select>
                      {value && <small>{skillDisplay(characterClass, value)?.ascensionEffect}</small>}
                    </label>
                  );
                })}
              </div>
              {ascensions.selectionOpen && (
                <div className="skill-ascension-actions">
                  {pendingAscensionConfirmation ? (
                    <>
                      <span role="status">確認後會鎖定目前選擇。</span>
                      <button className="btn btn-primary" disabled={busy
                        || ascensions.choices.slice(0, ascensions.rebirthCount).some((value) => value === null)}
                        onClick={() => {
                          if (confirmSkillAscensions(ascensions, characterClass)) onConfirmAscensions();
                          setPendingAscensionConfirmation(false);
                        }}>確認配置</button>
                      <button className="btn btn-ghost" disabled={busy}
                        onClick={() => setPendingAscensionConfirmation(false)}>返回</button>
                    </>
                  ) : (
                    <button className="btn btn-ghost" disabled={busy
                      || ascensions.choices.slice(0, ascensions.rebirthCount).some((value) => value === null)}
                      onClick={() => setPendingAscensionConfirmation(true)}>鎖定昇華選擇</button>
                  )}
                </div>
              )}
            </>
          )}
          <small className="skill-compact-note">商城可花 300 元寶重置技能點與出戰槽。</small>
        </div>
      </details>

      <div className="skill-library">
        <div className="skill-library-head">
          <div>
            <p className="skill-eyebrow">技能圖鑑</p>
            <h3>{characterClass}專精</h3>
          </div>
          <div className="skill-kind-tabs" role="group" aria-label="篩選技能類型">
            <button type="button" aria-pressed={kind === "active"} className={kind === "active" ? "active" : ""}
              onClick={() => setKind("active")}>主動 <span>{catalog.filter((skill) => skill.kind === "active").length}</span></button>
            <button type="button" aria-pressed={kind === "passive"} className={kind === "passive" ? "active" : ""}
              onClick={() => setKind("passive")}>被動 <span>{catalog.filter((skill) => skill.kind === "passive").length}</span></button>
          </div>
        </div>
        <p className="skill-library-caption">
          {kind === "active" ? `${learnedCount} / ${currentSkills.length} 已學・最多配置三招` : `${learnedCount} / ${currentSkills.length} 已學・投入後自動生效`}
        </p>
        <div className="skill-library-grid">
          {currentSkills.map((skill) => renderSkillCard(skill, kind, characterClass, characterLevel,
            build, available, busy, pendingUpgrade, setPendingUpgrade, onUpgrade))}
        </div>
      </div>
    </section>
  );
}

function renderSkillCard(
  skill: SkillDefinition,
  kind: "active" | "passive",
  characterClass: SkillClass,
  characterLevel: number,
  build: SkillBuild,
  available: number,
  busy: boolean,
  pendingUpgrade: string | null,
  setPendingUpgrade: (name: string | null) => void,
  onUpgrade: (name: string) => void,
) {
  const rank = build.ranks[skill.name] ?? 0;
  const locked = characterLevel < skill.unlockLevel;
  const display = skillDisplay(characterClass, skill.name);
  const equipped = build.activeSlots.includes(skill.name);
  const pending = pendingUpgrade === skill.name;
  const category = kind === "passive" ? "被動" : categoryNames[skill.category ?? "basic"] ?? "主動";
  const state = locked ? `Lv${skill.unlockLevel} 解鎖`
    : rank === 0 ? "尚未學習"
      : kind === "passive" ? "自動生效"
        : skill.category === "ultimate" ? "固定終極"
          : equipped ? "出戰中" : "已學習";

  return (
    <article className={`skill-entry ${rank ? "learned" : ""} ${locked ? "locked" : ""} ${equipped ? "equipped" : ""}`}
      key={skill.name}>
      <div className="skill-entry-top">
        <div className="skill-emblem" aria-hidden="true">{kind === "passive" ? "◇" : skill.category === "ultimate" ? "✦" : "⚔"}</div>
        <div className="skill-entry-heading">
          <span className="skill-entry-category">{category}{skill.category === "ultimate" ? "・固定" : ""}</span>
          <h4>{skill.name}</h4>
          <span className={`skill-entry-state ${rank ? "is-learned" : ""}`}>{state}</span>
        </div>
        <div className="skill-rank-value" aria-label={`技能等級 ${rank} / 5`}>{rank}<small>/5</small></div>
      </div>
      <div className="skill-rank-track" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <i className={index < rank ? "filled" : ""} key={index} />)}
      </div>
      {display && (
        <details className="skill-entry-details">
          <summary>效果與成長</summary>
          <div className="skill-entry-effect">
            {display.fixed.map((value) => <span className="skill-effect-chip" key={value}>{value}</span>)}
            {display.ascensionName && <p className="skill-ascension-effect">{display.ascensionName}・{display.ascensionEffect}</p>}
            <div className="skill-values-scroll" role="region" aria-label={`${skill.name}各等級效果`} tabIndex={0}>
              <table>
                <thead><tr><th scope="col">效果</th>{[1, 2, 3, 4, 5].map((n) => <th scope="col" key={n}>Lv{n}</th>)}</tr></thead>
                <tbody>{display.ranks.map((entry) => (
                  <tr key={entry.label}><th scope="row">{entry.label}</th>
                    {entry.values.map((value, index) => <td className={rank === index + 1 ? "current-rank" : ""} key={index}>{value}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </details>
      )}
      <div className="skill-entry-action">
        {pending ? (
          <div className="skill-upgrade-confirm">
            <span role="status">投入 1 點升至 Lv{rank + 1}？</span>
            <div>
              <button className="btn btn-primary" disabled={busy || locked || rank >= 5 || available < 1}
                onClick={() => {
                  if (upgradeSkill(build, characterClass, characterLevel, skill.name)) onUpgrade(skill.name);
                  setPendingUpgrade(null);
                }}>確認</button>
              <button className="btn btn-ghost" onClick={() => setPendingUpgrade(null)}>取消</button>
            </div>
          </div>
        ) : (
          <button className={rank ? "btn btn-ghost skill-upgrade" : "btn btn-primary skill-upgrade"}
            disabled={busy || locked || rank >= 5 || available < 1}
            onClick={() => setPendingUpgrade(skill.name)}>
            {locked ? `Lv${skill.unlockLevel} 解鎖` : rank >= 5 ? "已滿級" : rank ? "升級・1 點" : "學習・1 點"}
          </button>
        )}
      </div>
    </article>
  );
}
