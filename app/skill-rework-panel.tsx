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
import { SkillIcon } from "./skill-icon";

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
const progressionTiers = [
  { title: "初階", range: "Lv1–20", min: 1, max: 20 },
  { title: "進階", range: "Lv21–40", min: 21, max: 40 },
  { title: "高階", range: "Lv41–60", min: 41, max: 60 },
  { title: "終階", range: "Lv61–80", min: 61, max: 80 },
] as const;

export function SkillReworkPanel({ characterClass, characterLevel, build, onUpgrade, onEquip,
  ascensions, onSelectAscension, onConfirmAscensions, busy }: Props) {
  const [pendingUpgrade, setPendingUpgrade] = useState<string | null>(null);
  const [pendingAscensionConfirmation, setPendingAscensionConfirmation] = useState(false);
  const [kind, setKind] = useState<"active" | "passive">("active");
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);
  const [mobileSkillDetailOpen, setMobileSkillDetailOpen] = useState(false);
  const confirmationContext = `${characterClass}:${ascensions.rebirthCount}:${ascensions.selectionOpen}`;
  const [previousConfirmationContext, setPreviousConfirmationContext] = useState(confirmationContext);
  if (previousConfirmationContext !== confirmationContext) {
    setPreviousConfirmationContext(confirmationContext);
    setPendingAscensionConfirmation(false);
    setPendingUpgrade(null);
  }
  useEffect(() => {
    if (!mobileSkillDetailOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileSkillDetailOpen(false);
    };
    const mobileQuery = window.matchMedia("(max-width: 600px)");
    const closeWhenDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) setMobileSkillDetailOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    mobileQuery.addEventListener("change", closeWhenDesktop);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      mobileQuery.removeEventListener("change", closeWhenDesktop);
    };
  }, [mobileSkillDetailOpen]);

  const catalog = SKILL_REWORK_CATALOG[characterClass];
  const earned = earnedSkillPoints(characterLevel);
  const spent = spentSkillPoints(build);
  const available = Math.max(0, Math.max(earned, build.adminPointLimit ?? earned) - spent);
  const budgetExceeded = spent > earned;
  const progressSpent = Math.min(spent, earned);
  const learnedActive = catalog.filter((skill) => skill.kind === "active"
    && skill.category !== "ultimate" && (build.ranks[skill.name] ?? 0) > 0);
  const ultimateSkill = catalog.find((skill) => skill.category === "ultimate");
  const ultimate = enabledUltimate(build, characterClass, characterLevel);
  const currentSkills = catalog.filter((skill) => skill.kind === kind);
  const progressionIndex = progressionTiers.findIndex((tier) => characterLevel <= tier.max);
  const currentProgressionTier = progressionIndex < 0 ? progressionTiers.length - 1 : progressionIndex;
  const selectedSkill = currentSkills.find((skill) => skill.name === selectedSkillName) ?? currentSkills[0];
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
                aria-valuemin={0} aria-valuemax={Math.max(earned, 1)} aria-valuenow={progressSpent}>
                <span style={{ width: `${earned ? (progressSpent / earned) * 100 : 0}%` }} />
              </div>
              <p className="skill-overview-note">{budgetExceeded ? `已投入 ${spent} 點・超出一般上限 ${spent - earned} 點` : `已投入 ${spent} 點`} <i /> 角色 Lv{characterLevel}</p>
            </div>
            <div className="skill-state-summary">
              <span><b>{learnedActive.length}</b><small>已學戰技</small></span>
              <span><b>{confirmedAscensions}/{Math.min(ascensions.rebirthCount, 5)}</b><small>已選昇華</small></span>
              <span><b>{ultimate ? "啟用" : characterLevel >= (ultimateSkill?.unlockLevel ?? 80) ? "待學" : `Lv${ultimateSkill?.unlockLevel ?? 80}`}</b><small>固定終極</small></span>
            </div>
          </div>
        </div>
      </div>

      <div className="skill-loadout skill-loadout-sticky">
            <div className="skill-section-label"><span>出戰配置</span><small>最多三招</small></div>
            <div className="skill-loadout-slots">
              {build.activeSlots.map((name, index) => (
                <label className={name ? "skill-loadout-slot equipped" : "skill-loadout-slot"} key={index}>
                  <span className="skill-slot-number">0{index + 1}</span>
                  <SkillIcon name={name ?? undefined} characterClass={characterClass} variant="loadout" />
                  <span className="skill-loadout-copy">
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
                  {name && <small className="skill-loadout-description">{skillDisplay(characterClass, name)?.description}</small>}
                  </span>
                  <span className="skill-slot-check" aria-hidden="true">{name ? "✦" : "＋"}</span>
                </label>
              ))}
              {ultimateSkill && (
                <div className={ultimate ? "skill-loadout-slot skill-ultimate-slot equipped" : "skill-loadout-slot skill-ultimate-slot"}>
                  <span className="skill-slot-number">終</span>
                  <SkillIcon name={ultimateSkill.name} characterClass={characterClass} variant="loadout" />
                  <span className="skill-loadout-copy">
                    <span className="skill-ultimate-name">{ultimateSkill.name}</span>
                    <small className="skill-loadout-description">{skillDisplay(characterClass, ultimateSkill.name)?.description}</small>
                    <small>{ultimate ? `Lv${build.ranks[ultimateSkill.name]}/5` : characterLevel >= ultimateSkill.unlockLevel ? "投入技能點啟用" : `Lv${ultimateSkill.unlockLevel} 解鎖`}</small>
                  </span>
                  <span className="skill-slot-check" aria-hidden="true">✦</span>
                </div>
              )}
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
              onClick={() => { setKind("active"); setSelectedSkillName(catalog.find((skill) => skill.kind === "active")?.name ?? null); setPendingUpgrade(null); }}>主動 <span>{catalog.filter((skill) => skill.kind === "active").length}</span></button>
            <button type="button" aria-pressed={kind === "passive"} className={kind === "passive" ? "active" : ""}
              onClick={() => { setKind("passive"); setSelectedSkillName(catalog.find((skill) => skill.kind === "passive")?.name ?? null); setPendingUpgrade(null); }}>被動 <span>{catalog.filter((skill) => skill.kind === "passive").length}</span></button>
          </div>
        </div>
        <p className="skill-library-caption">
          {kind === "active" ? `${learnedCount} / ${currentSkills.length} 已學・最多配置三招` : `${learnedCount} / ${currentSkills.length} 已學・投入後自動生效`}
        </p>
        <div className="skill-progression-route" role="list" aria-label={`技能成長路線，目前角色等級 ${characterLevel}`}>
          {progressionTiers.map((tier, index) => {
            const complete = characterLevel > tier.max;
            const current = index === currentProgressionTier;
            return (
              <div className={`skill-route-step ${complete ? "complete" : ""} ${current ? "current" : ""}`} role="listitem" key={tier.title}>
                <span className="skill-route-node" aria-hidden="true">{complete ? "✓" : `0${index + 1}`}</span>
                <span className="skill-route-copy"><strong>{tier.title}</strong><small>{tier.range}</small></span>
              </div>
            );
          })}
          <span className="skill-route-level">Lv{characterLevel}</span>
        </div>
        <div className="skill-library-layout">
          <div className="skill-tree" aria-label={`${kind === "active" ? "主動" : "被動"}技能等級路線`}>
            {progressionTiers.map((tier, tierIndex) => {
              const tierSkills = currentSkills.filter((skill) => skill.unlockLevel >= tier.min
                && skill.unlockLevel <= tier.max);
              if (!tierSkills.length) return null;
              return (
                <section className="skill-tree-tier" key={tier.title} aria-label={tier.title}>
                  <div className="skill-tree-tier-head">
                    <span className="skill-tree-tier-mark" aria-hidden="true">0{tierIndex + 1}</span>
                    <div><strong>{tier.title}</strong><small>{tier.range}</small></div>
                  </div>
                  <div className="skill-tree-nodes">
                    {tierSkills.map((skill) => {
                      const rank = build.ranks[skill.name] ?? 0;
                      const locked = characterLevel < skill.unlockLevel && rank === 0;
                      const equipped = build.activeSlots.includes(skill.name);
                      const selected = selectedSkill?.name === skill.name;
                      const state = locked ? `Lv${skill.unlockLevel} 解鎖`
                        : rank ? skill.kind === "passive" ? "自動生效" : equipped ? "出戰中" : "已學習"
                          : "可投入技能點";
                      return (
                        <button type="button" key={skill.name}
                          className={`skill-tree-node ${skill.kind === "active" ? "has-skill-description" : ""} ${locked ? "locked" : ""} ${rank ? "learned" : ""} ${equipped ? "equipped" : ""} ${selected ? "selected" : ""}`}
                          aria-pressed={selected}
                          aria-label={`${skill.name}，${state}，技能等級 ${rank}／5`}
                          onClick={() => {
                            setSelectedSkillName(skill.name);
                            setPendingUpgrade(null);
                            if (window.matchMedia("(max-width: 600px)").matches) setMobileSkillDetailOpen(true);
                          }}>
                          <SkillIcon name={skill.name} characterClass={characterClass} kind={skill.kind} />
                          <span className="skill-tree-node-copy">
                            <strong>{skill.name}</strong>
                            <small>{state}</small>
                          </span>
                          <span className="skill-tree-node-level">{rank ? `Lv${rank}/5` : `Lv${skill.unlockLevel}`}</span>
                          {skill.kind === "active" && <span className="skill-active-description">{skillDisplay(characterClass, skill.name)?.description}</span>}
                          <span className="skill-tree-rank-track" aria-hidden="true">
                            {Array.from({ length: 5 }, (_, index) => <i className={index < rank ? "filled" : ""} key={index} />)}
                          </span>
                          {locked && skill.kind !== "active" && <span className="skill-node-lock-overlay" aria-hidden="true">未解鎖<span>Lv{skill.unlockLevel}</span></span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          {selectedSkill && renderSkillDetails(selectedSkill, characterClass, characterLevel, build,
            available, busy, pendingUpgrade, setPendingUpgrade, onUpgrade, onEquip,
            mobileSkillDetailOpen, () => setMobileSkillDetailOpen(false))}
        </div>
      </div>
    </section>
  );
}

function renderSkillDetails(
  skill: SkillDefinition,
  characterClass: SkillClass,
  characterLevel: number,
  build: SkillBuild,
  available: number,
  busy: boolean,
  pendingUpgrade: string | null,
  setPendingUpgrade: (name: string | null) => void,
  onUpgrade: (name: string) => void,
  onEquip: (slot: number, name: string | null) => void,
  mobileDetailOpen: boolean,
  onCloseMobileDetail: () => void,
) {
  const rank = build.ranks[skill.name] ?? 0;
  const locked = characterLevel < skill.unlockLevel && rank === 0;
  const display = skillDisplay(characterClass, skill.name);
  const equipped = build.activeSlots.includes(skill.name);
  const pending = pendingUpgrade === skill.name;
  const kind = skill.kind;
  const category = kind === "passive" ? "被動" : categoryNames[skill.category ?? "basic"] ?? "主動";
  const state = locked ? `Lv${skill.unlockLevel} 解鎖`
    : rank === 0 ? "尚未學習"
      : kind === "passive" ? "自動生效"
        : skill.category === "ultimate" ? "固定終極"
          : equipped ? "出戰中" : "已學習";

  return (
    <>
      {mobileDetailOpen && <button type="button" className="skill-detail-backdrop" aria-label="關閉技能詳情" onClick={onCloseMobileDetail} />}
      <aside className={`skill-detail-panel ${locked ? "locked" : ""} ${mobileDetailOpen ? "mobile-open" : ""}`}
        role={mobileDetailOpen ? "dialog" : undefined} aria-modal={mobileDetailOpen || undefined}
        aria-live="polite" aria-label={`${skill.name}技能詳情`}>
      <button type="button" className="skill-detail-close" aria-label="關閉技能詳情" onClick={onCloseMobileDetail}>×</button>
      <div className="skill-detail-heading">
        <SkillIcon name={skill.name} characterClass={characterClass} kind={skill.kind} variant="detail" />
        <div>
          <span className="skill-entry-category">{category}{skill.category === "ultimate" ? "・固定" : ""}</span>
          <h4>{skill.name}</h4>
          <p className={locked ? "skill-detail-state is-locked" : "skill-detail-state"}>{state}</p>
        </div>
        <span className="skill-detail-rank">{rank}<small>/5</small></span>
      </div>

      <div className="skill-detail-gates">
        <span><small>解鎖等級</small><strong>Lv{skill.unlockLevel}</strong></span>
        <span><small>角色等級</small><strong>Lv{characterLevel}</strong></span>
        <span><small>技能等級</small><strong>{rank} / 5</strong></span>
      </div>

      {display && (
        <div className="skill-detail-effects">
          {display.description && <p className="skill-detail-description">{display.description}</p>}
          <div className="skill-detail-effect-head">
            <span>效果與成長</span>
            <small>{rank ? `Lv${rank} → Lv${Math.min(rank + 1, 5)}` : "學習後 Lv1"}</small>
          </div>
          {display.fixed.map((value) => <span className="skill-effect-chip" key={value}>{value}</span>)}
          <div className="skill-detail-values" role="table" aria-label={`${skill.name}目前與下級效果`}>
            <div className="skill-detail-value-row skill-detail-value-head" role="row">
              <span role="columnheader">效果</span><span role="columnheader">目前</span><span role="columnheader">下級</span>
            </div>
            {display.ranks.map((entry) => (
              <div className="skill-detail-value-row" role="row" key={entry.label}>
                <strong role="rowheader">{entry.label}</strong>
                <span>{rank ? entry.values[rank - 1] : "未學習"}</span>
                <span className="skill-detail-next">{rank >= 5 ? "已滿級" : entry.values[rank]}</span>
              </div>
            ))}
          </div>
          {display.ascensionName && (
            <details className="skill-detail-ascension">
              <summary>昇華效果預覽</summary>
              <p>{display.ascensionName}・{display.ascensionEffect}</p>
            </details>
          )}
        </div>
      )}

      {kind === "active" && skill.category !== "ultimate" && rank > 0 && !locked && (
        <div className="skill-detail-equip">
          <span>配置到出戰槽</span>
          <div>
            {build.activeSlots.map((name, index) => (
              <button type="button" className="btn btn-ghost" key={index}
                disabled={busy || name === skill.name || equipped}
                onClick={() => onEquip(index, skill.name)}>
                {name === skill.name ? `槽${index + 1} 已配置` : name ? `替換槽${index + 1}` : `配置到槽${index + 1}`}
              </button>
            ))}
          </div>
        </div>
      )}
      {kind === "passive" && rank > 0 && !locked && (
        <p className="skill-passive-auto"><span aria-hidden="true">✦</span> 已學被動會自動生效</p>
      )}

      <div className="skill-detail-action">
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
      </aside>
    </>
  );
}
