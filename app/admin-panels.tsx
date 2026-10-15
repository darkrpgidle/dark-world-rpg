"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, Users, ShieldAlert, History, SlidersHorizontal, Gift, ShieldCheck } from "lucide-react";
import { AdminMailComposer } from "./gm-mail-ui";
import { GmSecurityPanel } from "./gm-security-panel";
import { equippedSlotIndex, replaceEquippedSlot } from "./admin-equipment";
import { adminLocalDateTime } from "./admin-state";
import { normalizeAdminAscensions } from "./admin-skill-ascensions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { maps } from "./game-data";
import { ALL_CATALOG_EQUIPMENT } from "./mythic-data";
import { createSkillBuild, earnedSkillPoints, SKILL_REWORK_CATALOG, spentSkillPoints, type SkillClass, type SkillBuild } from "./skill-rework";
import { createSkillAscensions, ascensionOptions, type SkillAscensionState } from "./skill-ascensions";

type EditableEquipment = {
  name?: string; slot?: string; quality?: string; enhance?: number;
  id?: number; reforgeCount?: number; affixes?: string[];
  [key: string]: unknown;
};
type EditableSave = {
  playerName?: string; playerClass?: string; rebirthCount?: number;
  level?: number; exp?: number; mapId?: number; unlockedMapId?: number;
  highestFloor?: number; mapBestFloors?: Record<string, number>;
  finalBossDefeated?: boolean; skillReworkBuild?: SkillBuild;
  skillAscensions?: SkillAscensionState; items?: EditableEquipment[];
  gold?: number; yuanbao?: number; enhanceStones?: number; reforgeStones?: number;
  bossTickets?: number; worldAttempts?: number; idleSeconds?: number;
  [key: string]: unknown;
};

// Queue automatic loads after the view commits, and cancel an obsolete trigger
// when its tab, search or selected player changes before the request starts.
function useAdminLoad(load: () => Promise<void>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      void load().catch(() => toast.error("目前無法取得管理資料"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, enabled]);
}

const EQUIPMENT_SLOTS = ["武器", "頭盔", "胸甲", "手套", "鞋子", "項鍊", "戒指", "腰帶", "護腕", "披風"] as const;
const SCENE_EQUIPMENT_OPTIONS = maps.flatMap((map) => EQUIPMENT_SLOTS.flatMap((slot) => [
  { name: `${map.gearPrefix}${slot}`, map: map.name },
  { name: `${map.set}${slot}`, map: map.name },
]));
const EQUIPMENT_OPTIONS_BY_SLOT = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [
  slot,
  [...SCENE_EQUIPMENT_OPTIONS.filter((item) => item.name.endsWith(slot)), ...ALL_CATALOG_EQUIPMENT.filter((item) => item.slot === slot).map((item) => ({ name: item.name, map: "特殊裝備" }))]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.name === item.name) === index),
])) as Record<string, { name: string; map: string }[]>;

export function AdminMonitor({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "players" | "snapshots" | "editor" | "grants" | "security">("overview");
  const [managedAccountId,setManagedAccountId]=useState("");
  const [managedQuery,setManagedQuery]=useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetPreview, setResetPreview] = useState<{
    fingerprint: string;
    canExecute: boolean;
    summary: { playerAccountCount: number; saveCount: number; deathEventCount: number; sessionCount: number; snapshotCount: number; protectedGmAccountCount: number; tier1Plus: number; tier3Plus: number; tier5Plus: number; tier10Plus: number };
    issueCounts: Record<string, number>;
  } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [overview, setOverview] = useState<{
    serverTime: string;
    database: {
      accounts: number;
      saves: number;
      onlineViewers: number;
      onlinePlayers: { accountId: string; username: string; playerId: string | null; playerName: string; level: number }[];
      latestSaveAt: string | null;
    };
    deathAnalytics: {
      totalDeaths: number;
      playersEntered: number;
      averageDeathsPerEnteredPlayer: number;
      hotspots: { mapId: number; mapName: string; floor: number; deaths: number }[];
    };
  } | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "monitor_failed");
      setOverview(result);
    } catch {
      setError("目前無法取得監控資料");
    } finally {
      setLoading(false);
    }
  }, []);
  const inspectReset = async () => {
    setResetBusy(true);
    setResetPhrase("");
    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "preview" }), cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "preview_failed");
      setResetPreview(result);
      setResetOpen(true);
    } catch {
      toast.error("無法檢查重置範圍");
    } finally { setResetBusy(false); }
  };
  const executeReset = async () => {
    if (!resetPreview || resetPhrase !== "重置所有角色資料") return;
    setResetBusy(true);
    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "execute", fingerprint: resetPreview.fingerprint, confirmation: resetPhrase }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${result.error ?? "reset_failed"}${result.diagnostic ? `|${result.diagnostic}` : ""}`);
      toast.success("角色資料已清空", { description: `已保留 ${result.accountsPreserved} 個玩家帳號，核對 ${result.archivedAndVerified} 份備份，並登出所有帳號（含 GM）。` });
      setResetOpen(false);
      setResetPreview(null);
      setResetPhrase("");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      const message = error instanceof Error ? error.message : "reset_failed";
      const [code, diagnostic] = message.split("|", 2);
      if (code === "reset_transaction_failed") {
        toast.error("重置交易失敗，資料未變更", { description: diagnostic || "請將這段錯誤訊息提供給管理員以便排查。" });
      } else if (code === "not_authenticated") {
        toast.error("GM 登入已失效，請重新登入後重試");
      } else {
        toast.error(code === "preview_stale" ? "帳號或轉生補償範圍有變動，請重新檢查" : code === "history_review_required" ? "有轉生紀錄需要先核對，尚未重置" : "重置沒有完成，資料未清除；請檢查登入狀態後重試");
      }
      if (code === "preview_stale") {
        setResetOpen(false);
        setResetPreview(null);
      }
    } finally { setResetBusy(false); }
  };
  useAdminLoad(refresh, open);
  useEffect(()=>{if(!open || activeTab!=="overview")return;const timer=window.setInterval(()=>void refresh(),30000);return()=>window.clearInterval(timer);},[open,activeTab,refresh]);
  const navigation=[{id:"overview",label:"監控總覽",icon:LayoutDashboard},{id:"security",label:"異常存檔",icon:ShieldAlert},
    {id:"players",label:"玩家管理",icon:Users},{id:"editor",label:"存檔編輯",icon:SlidersHorizontal},
    {id:"snapshots",label:"存檔還原",icon:History},{id:"grants",label:"資源發放",icon:Gift}] as const;
  const pageTitle=navigation.find(item=>item.id===activeTab)?.label ?? "監控總覽";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gm-workbench">
        <DialogHeader className="gm-workbench-header">
          <div className="gm-brand"><ShieldCheck size={28}/><div><small>DARK WORLD</small><DialogTitle>GM 管理中心</DialogTitle></div></div>
          <DialogDescription>監控、查核與玩家資料管理</DialogDescription>
        </DialogHeader>
        <div className="gm-workbench-body">
        <nav className="gm-navigation" aria-label="GM 管理功能">
          {navigation.map(item=><button key={item.id} className={activeTab===item.id ? "active" : ""} aria-current={activeTab===item.id ? "page" : undefined} onClick={()=>setActiveTab(item.id)}><item.icon size={20}/><span>{item.label}</span></button>)}
          <small>管理動作由伺服器核對 GM 權限</small>
        </nav>
        <main className="gm-workbench-content">
        <div className="gm-page-heading"><h2>{pageTitle}</h2><span>{activeTab==="overview" && overview ? `更新於 ${new Date(overview.serverTime).toLocaleTimeString("zh-TW",{timeZone:"Asia/Taipei"})}` : ""}</span></div>
        {activeTab === "security" && <GmSecurityPanel onSelectPlayer={username=>{setManagedQuery(username);setActiveTab("players");}}/>}
        {activeTab === "overview" && <>
          {loading && <p>讀取中……</p>}
          {error && <p className="error-text">{error}</p>}
          {overview && (
          <>
          <div className="admin-monitor-grid">
            <div><small>伺服器狀態</small><strong className="gain">正常</strong></div>
            <div><small>正式帳號</small><strong>{overview.database.accounts}</strong></div>
            <div><small>遊戲存檔</small><strong>{overview.database.saves}</strong></div>
            <div><small>目前瀏覽人數</small><strong>{overview.database.onlineViewers}</strong></div>
            <div><small>伺服器時間</small><strong>{new Date(overview.serverTime).toLocaleString("zh-TW")}</strong></div>
            <div><small>最近存檔</small><strong>{overview.database.latestSaveAt ? new Date(overview.database.latestSaveAt).toLocaleString("zh-TW") : "尚無"}</strong></div>
            <div><small>死亡總數</small><strong>{overview.deathAnalytics.totalDeaths.toLocaleString()}</strong></div>
            <div><small>進入玩家</small><strong>{overview.deathAnalytics.playersEntered.toLocaleString()}</strong></div>
            <div><small>平均死亡／玩家</small><strong>{overview.deathAnalytics.averageDeathsPerEnteredPlayer}</strong></div>
          </div>
          <div className="death-hotspot-panel">
            <div className="section-head"><h3>各關卡死亡熱區</h3><span>累計戰敗次數</span></div>
            {overview.deathAnalytics.hotspots.length ? (
              <ol className="death-hotspot-list">
                {overview.deathAnalytics.hotspots.map((hotspot) => (
                  <li key={`${hotspot.mapId}-${hotspot.floor}`}>
                    <span>{hotspot.mapName}・第 {hotspot.floor} 層</span>
                    <b>{hotspot.deaths.toLocaleString()} 次</b>
                  </li>
                ))}
              </ol>
            ) : <p className="death-hotspot-empty">尚無死亡紀錄；正式上線後將自動累計。</p>}
          </div>
          </>
          )}
          <button className="btn btn-primary" onClick={() => void refresh()} disabled={loading}>重新整理</button>
          <details className="gm-danger-zone"><summary>全服資料重置</summary><p>清空所有角色進度、保留帳號；先核對範圍與備份，再輸入確認文字。</p>
          <button className="btn btn-danger" onClick={() => void inspectReset()} disabled={resetBusy}>
            {resetBusy ? "檢查中……" : "檢查並重置角色資料"}
          </button>
          </details>
          <AlertDialog open={resetOpen} onOpenChange={(open) => { if (!open && !resetBusy) { setResetOpen(false); setResetPhrase(""); } }}>
            <AlertDialogContent className="sale-dialog">
              <AlertDialogHeader>
                <AlertDialogTitle>確認全服角色資料重置</AlertDialogTitle>
              <AlertDialogDescription>帳號 ID、帳號名稱與密碼會保留；角色存檔與遊戲進度會清除。轉生補償依帳號 ID 保存。重置成功時會登出所有玩家與 GM，所有人需重新登入。</AlertDialogDescription>
              </AlertDialogHeader>
              {resetPreview && <div className="admin-monitor-grid">
                <div><small>保留玩家帳號</small><strong>{resetPreview.summary.playerAccountCount}</strong></div>
                <div><small>保留 GM 帳號</small><strong>{resetPreview.summary.protectedGmAccountCount}</strong></div>
                <div><small>清除角色存檔</small><strong>{resetPreview.summary.saveCount}</strong></div>
                <div><small>清除死亡紀錄</small><strong>{resetPreview.summary.deathEventCount}</strong></div>
                <div><small>重置後登出（含 GM）</small><strong>{resetPreview.summary.sessionCount}</strong></div>
                <div><small>保留既有快照</small><strong>{resetPreview.summary.snapshotCount}</strong></div>
                <div><small>1 轉以上</small><strong>{resetPreview.summary.tier1Plus}</strong></div>
                <div><small>3 轉以上</small><strong>{resetPreview.summary.tier3Plus}</strong></div>
                <div><small>5 轉以上</small><strong>{resetPreview.summary.tier5Plus}</strong></div>
                <div><small>10 轉以上</small><strong>{resetPreview.summary.tier10Plus}</strong></div>
              </div>}
              {resetPreview && !resetPreview.canExecute && <p className="error-text">轉生資料有 {Object.values(resetPreview.issueCounts).reduce((sum, count) => sum + count, 0)} 筆需要核對；目前不會執行重置。</p>}
              <p className="admin-tab-description">每份現行存檔會先建立 GM 快照並逐筆比對。帳號資料與 GM 操作紀錄不刪除。</p>
              <label className="admin-search">輸入「重置所有角色資料」確認
                <input value={resetPhrase} onChange={(event) => setResetPhrase(event.target.value)} autoComplete="off" />
              </label>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={resetBusy}>取消</AlertDialogCancel>
                <AlertDialogAction className="btn-danger" disabled={resetBusy || !resetPreview?.canExecute || resetPhrase !== "重置所有角色資料"} onClick={(event) => { event.preventDefault(); void executeReset(); }}>
                  {resetBusy ? "重置中……" : "確認清空角色資料"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>}
        {activeTab === "players" && <AdminPlayerManagement key={managedQuery} initialQuery={managedQuery} onEdit={id=>{setManagedAccountId(id);setActiveTab("editor");}} onSnapshots={id=>{setManagedAccountId(id);setActiveTab("snapshots");}}/>}
        {activeTab === "snapshots" && <AdminSaveRestore key={managedAccountId} initialAccountId={managedAccountId}/>}
        {activeTab === "editor" && <AdminSaveEditor key={managedAccountId} initialAccountId={managedAccountId}/>}
        {activeTab === "grants" && <AdminPermissionsPanel />}
        </main></div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminSaveEditor({initialAccountId=""}:{initialAccountId?:string}={}) {
  const slots = EQUIPMENT_SLOTS;
  const [players, setPlayers] = useState<{ accountId: string; username: string; playerName: string; level: number | null; isSelf?: boolean }[]>([]);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [loadedAccountId,setLoadedAccountId]=useState("");
  const [updatedAt,setUpdatedAt]=useState<string|null>(null);
  const loadGeneration=useRef(0);
  const [page, setPage] = useState<"character" | "equipment" | "resources">("character");
  const [save, setSave] = useState<EditableSave>({ playerName: "", playerClass: "戰士", rebirthCount: 0, level: 1, exp: 0, mapId: 1, unlockedMapId: 1, highestFloor: 1, skillReworkBuild: createSkillBuild(), skillAscensions: createSkillAscensions(), gold: 0, yuanbao: 0, enhanceStones: 0, reforgeStones: 0, items: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof EditableSave>(key: K, value: EditableSave[K]) => setSave((old) => ({ ...old, [key]: value }));
  const loadPlayers = useCallback(async () => {
    const r = await fetch("/api/admin/players?includeSelf=1", { cache: "no-store" }); const data = await r.json();
    if(!r.ok)throw new Error(); const list = data.players ?? []; setPlayers(list); setAccountId((current) => current || list[0]?.accountId || "");
  }, []);
  const editingSelf = Boolean(players.find(player => player.accountId === accountId)?.isSelf);
  const loadSave = useCallback(async (id: string) => {
    if (!id) return; const generation=++loadGeneration.current;setLoadedAccountId(""); setLoading(true);
    try { const r = await fetch(`/api/admin/edit-save?accountId=${encodeURIComponent(id)}`, { cache: "no-store" }); const data = await r.json(); if (!r.ok) throw new Error();if(generation!==loadGeneration.current)return;setUpdatedAt(data.updatedAt ?? null);setLoadedAccountId(id); setSave(data.save ?? { playerName: data.account?.username ?? "", playerClass: "戰士", rebirthCount: 0, level: 1, exp: 0, mapId: 1, unlockedMapId: 1, highestFloor: 1, skillReworkBuild: createSkillBuild(), skillAscensions: createSkillAscensions(), gold: 0, yuanbao: 0, enhanceStones: 0, reforgeStones: 0, items: [] }); } catch { toast.error("無法讀取指定玩家存檔"); } finally { if(generation===loadGeneration.current)setLoading(false); }
  }, []);
  useAdminLoad(loadPlayers);
  const loadSelectedSave = useCallback(() => loadSave(accountId), [accountId, loadSave]);
  useAdminLoad(loadSelectedSave, Boolean(accountId));
  const saveEdit = async () => {
    if(loadedAccountId!==accountId || loading || saving)return;
    setSaving(true);
    try { const r = await fetch("/api/admin/edit-save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, save, expectedUpdatedAt:updatedAt }) }); const data = await r.json();if (!r.ok) throw new Error(data.error);setUpdatedAt(data.updatedAt); setSave(data.save); toast.success("指定玩家存檔修改成功", { description: "已建立修改前備份並登出目標帳號；修改自己後請重新登入載入新存檔。" }); } catch(error) { toast.error(error instanceof Error && error.message==="save_conflict" ? "雲端存檔已更新，請重新讀取後再修改" : "存檔修改失敗"); } finally { setSaving(false); }
  };
  const characterClass = (save.playerClass ?? "戰士") as SkillClass;
  const characterLevel = Math.max(1, Math.min(100, Number(save.level) || 1));
  const reworkBuild = (save.skillReworkBuild ?? createSkillBuild()) as SkillBuild;
  const skillCatalog = SKILL_REWORK_CATALOG[characterClass] ?? SKILL_REWORK_CATALOG.戰士;
  const adminAscensions = normalizeAdminAscensions(save.skillAscensions, characterClass, save.rebirthCount);
  const earnedPoints = earnedSkillPoints(characterLevel);
  const pointLimit = Math.max(earnedPoints, Number(reworkBuild.adminPointLimit) || earnedPoints);
  const spentPoints = spentSkillPoints(reworkBuild);
  const updateReworkBuild = (next: SkillBuild) => update("skillReworkBuild", next);
  const updateSkillRank = (name: string, rank: number) => {
    const oldRank = Number(reworkBuild.ranks[name] ?? 0);
    const nextSpent = spentPoints + rank - oldRank;
    if (nextSpent > pointLimit) {
      toast.error("新版技能點不足", { description: `已投入 ${spentPoints}／${pointLimit} 點。` });
      return;
    }
    const ranks = { ...reworkBuild.ranks };
    if (rank === 0) delete ranks[name]; else ranks[name] = rank;
    const activeSlots = reworkBuild.activeSlots.map((slot) => slot === name && rank === 0 ? null : slot) as SkillBuild["activeSlots"];
    updateReworkBuild({ ...reworkBuild, ranks, activeSlots });
  };
  const items = Array.isArray(save.items) ? save.items : [];
  return <section className="admin-tab-panel">
    <p className="admin-tab-description">修改前會自動建立備份。在線玩家會持續更新存檔，建議先登出再編輯；版本變更時會拒絕覆蓋。GM 管理開啟期間暫停本視窗自動存檔；修改自己的存檔後會登出，請重新登入。</p>
    <button className="btn" disabled={!accountId || saving || loading || editingSelf} onClick={async()=>{setSaving(true);try{const response=await fetch("/api/admin/player-control",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accountId,action:"logout"})});if(!response.ok)throw new Error();await loadSave(accountId);toast.success("玩家已登出，已重新讀取雲端存檔");}catch{toast.error("無法登出玩家，請確認登入狀態");}finally{setSaving(false);}}}>登出玩家並重新讀取</button>
    <label className="admin-search">指定玩家<select value={accountId} disabled={saving} onChange={(e) => {loadGeneration.current++;setLoadedAccountId("");setAccountId(e.target.value);}}>{players.map((p) => <option key={p.accountId} value={p.accountId}>{p.username}{p.isSelf ? "（自己）" : ""} · {p.playerName} · Lv.{p.level ?? 0}</option>)}</select></label>
    <div className="gm-tabs" role="tablist" aria-label="指定玩家存檔修改分頁">
      <button className={page === "character" ? "active" : ""} onClick={() => setPage("character")}>角色與進度</button><button className={page === "equipment" ? "active" : ""} onClick={() => setPage("equipment")}>十件裝備</button><button className={page === "resources" ? "active" : ""} onClick={() => setPage("resources")}>資源</button>
    </div>
    {loading ? <p>讀取中……</p> : page === "character" ? <div className="admin-form-grid">
      <label>角色名稱<input value={save.playerName ?? ""} onChange={(e) => update("playerName", e.target.value)} /></label><label>職業<select value={characterClass} onChange={(e) => { update("playerClass", e.target.value); updateReworkBuild(createSkillBuild()); update("skillAscensions", normalizeAdminAscensions(null, e.target.value as SkillClass, save.rebirthCount)); }}><option>戰士</option><option>遊俠</option><option>法師</option></select></label>
      <label>轉生次數<input type="number" min="0" max="5" value={save.rebirthCount ?? 0} onChange={(e) => { const count = Math.max(0, Math.min(5, Math.floor(Number(e.target.value)) || 0)); setSave(old => ({ ...old, rebirthCount: count, skillAscensions: normalizeAdminAscensions(old.skillAscensions, characterClass, count) })); }} /></label><label>等級<input type="number" min="1" max="100" value={save.level ?? 1} onChange={(e) => update("level", Number(e.target.value))} /></label><label>經驗值<input type="number" min="0" value={save.exp ?? 0} onChange={(e) => update("exp", Number(e.target.value))} /></label><label>新版技能點數上限<input type="number" min={Math.max(earnedPoints, spentPoints)} max="100" value={pointLimit} onChange={(e) => { const limit = Math.max(earnedPoints, spentPoints, Math.min(100, Number(e.target.value) || 0)); updateReworkBuild({ ...reworkBuild, ...(limit > earnedPoints ? { adminPointLimit: limit } : { adminPointLimit: undefined }) }); }} /></label><p className="admin-tab-description admin-wide">一般角色依等級取得技能點；GM 可為驗收角色提高上限，最高 100 點。新版技能配置不使用舊版技能點欄位。輪迴天賦點每轉提供 3 點。</p>
      <label>當前地圖<select value={save.mapId ?? 1} onChange={(e) => update("mapId", Number(e.target.value))}>{maps.map((map) => <option key={map.id} value={map.id}>{map.id}. {map.name}</option>)}</select></label><label>解鎖地圖<select value={save.unlockedMapId ?? 1} onChange={(e) => update("unlockedMapId", Number(e.target.value))}>{maps.map((map) => <option key={map.id} value={map.id}>{map.id}. {map.name}</option>)}</select></label><label>最高通關層數<select value={save.highestFloor ?? 1} onChange={(e) => update("highestFloor", Number(e.target.value))}>{Array.from({ length: 30 }, (_, index) => index + 1).map((floor) => <option key={floor} value={floor}>第 {floor} 層</option>)}</select></label><label>最終首領<input type="checkbox" checked={Boolean(save.finalBossDefeated)} onChange={(e) => update("finalBossDefeated", e.target.checked)} /></label>
      <div className="admin-wide"><strong>各地圖最高通關層數</strong><div className="admin-form-grid">{maps.map((map) => <label key={map.id}>{map.name}<select value={Number(save.mapBestFloors?.[String(map.id)] ?? 0)} onChange={(e) => update("mapBestFloors", { ...(save.mapBestFloors ?? {}), [String(map.id)]: Number(e.target.value) })}><option value="0">未通關</option>{Array.from({ length: 30 }, (_, index) => index + 1).map((floor) => <option key={floor} value={floor}>第 {floor} 層</option>)}</select></label>)}</div></div>
      <div className="admin-wide">
        <div className="section-head"><strong>新版技能配置</strong><span>已投入 {spentPoints}／{pointLimit} 點</span></div>
        <p className="admin-tab-description">昇華依轉生次數開放；第二、三轉不可重複，第五轉奧義自動配置。未選完可儲存，玩家重新登入後完成選擇。</p>
        <div className="admin-form-grid">{Array.from({ length: adminAscensions.rebirthCount }, (_, index) => { const tier = index + 1; const options = ascensionOptions(characterClass, tier); return <label key={tier}>第 {tier} 轉昇華<select value={adminAscensions.choices[index] ?? ""} disabled={tier === 5} onChange={event => { const choices = [...adminAscensions.choices]; choices[index] = event.target.value || null; update("skillAscensions", normalizeAdminAscensions({ choices }, characterClass, save.rebirthCount)); }}><option value="">待玩家選擇</option>{options.map(name => <option key={name} value={name} disabled={(tier === 2 && adminAscensions.choices[2] === name) || (tier === 3 && adminAscensions.choices[1] === name)}>{name}</option>)}</select></label>; })}</div>
        {adminAscensions.rebirthCount === 0 && <p className="admin-tab-description">尚未轉生，沒有可選昇華。</p>}
        <p className="admin-tab-description">設定新版主動、被動與固定終極技能等級。測試帳號可在 Lv.50 以上使用「全技能滿級」快捷配置。</p>
        <div className="gm-tabs"><button type="button" className="btn" disabled={characterLevel < 50} onClick={() => { const ranks = Object.fromEntries(skillCatalog.map((skill) => [skill.name, 5])); const slots = skillCatalog.filter((skill) => skill.kind === "active" && skill.category !== "ultimate").slice(0, 3).map((skill) => skill.name) as [string, string, string]; updateReworkBuild({ ranks, activeSlots: slots, adminPointLimit: 100 }); }} title={characterLevel < 50 ? "先將角色等級調整至 50" : "GM 測試配置，不消耗一般等級技能點"}>全技能滿級（測試用）</button><button type="button" className="btn" onClick={() => updateReworkBuild(createSkillBuild())}>清空新版技能</button></div>
        <div className="admin-form-grid">{skillCatalog.map((skill) => <label key={skill.name}>{skill.name}{skill.category === "ultimate" ? "・固定終極" : skill.kind === "passive" ? "・被動" : "・主動"}<select value={Number(reworkBuild.ranks[skill.name] ?? 0)} disabled={characterLevel < skill.unlockLevel} onChange={(e) => updateSkillRank(skill.name, Number(e.target.value))}><option value="0">未學習</option>{Array.from({ length: 5 }, (_, index) => index + 1).map((rank) => <option key={rank} value={rank}>Lv.{rank}</option>)}</select></label>)}</div>
        <div className="admin-form-grid">{reworkBuild.activeSlots.map((selected, slot) => <label key={slot}>主動技能槽 {slot + 1}<select value={selected ?? ""} onChange={(e) => { const activeSlots = [...reworkBuild.activeSlots] as SkillBuild["activeSlots"]; const value = e.target.value || null; if (value && activeSlots.some((name, index) => index !== slot && name === value)) { toast.error("同一招不能重複配置"); return; } activeSlots[slot] = value; updateReworkBuild({ ...reworkBuild, activeSlots }); }}><option value="">空槽</option>{skillCatalog.filter((skill) => skill.kind === "active" && skill.category !== "ultimate" && Number(reworkBuild.ranks[skill.name] ?? 0) > 0).map((skill) => <option key={skill.name} value={skill.name}>{skill.name}</option>)}</select></label>)}</div>
      </div>
    </div> : page === "equipment" ? <div><p className="admin-tab-description">編輯目前配置 {save.activeLoadout===2 ? "二" : "一"} 穿著的十個槽位。背包內其他裝備不會被取代；選擇「未裝備」只會卸下。</p><div className="admin-equipment-grid">{slots.map(slot=>{const index=equippedSlotIndex(save,slot);const item=index>=0 ? items[index] : undefined;const options=EQUIPMENT_OPTIONS_BY_SLOT[slot] ?? [];const change=(patch:Partial<EditableEquipment>)=>setSave(old=>replaceEquippedSlot(old,slot,patch));return <article className="admin-equipment-card" key={slot}><strong>{slot}<small>{item?.id ? `裝備 ID ${item.id}` : "空槽"}</small></strong><label>裝備<select aria-label={`${slot}裝備`} value={item?.name ?? ""} onChange={e=>change({name:e.target.value})}><option value="">未裝備</option>{options.map(option=><option key={`${option.map}-${option.name}`} value={option.name}>{option.name} · {option.map}</option>)}</select></label><div><label>品質<select disabled={!item} value={item?.quality ?? "普通"} onChange={e=>change({quality:e.target.value})}><option>普通</option><option>良好</option><option>優秀</option><option>史詩</option><option>傳奇</option><option>神話</option></select></label><label>強化<input disabled={!item} type="number" min="0" max="15" value={item?.enhance ?? 0} onChange={e=>change({enhance:Number(e.target.value)})}/></label><label>累計洗鍊<input disabled={!item} type="number" min="0" max="1000" value={item?.reforgeCount ?? 0} onChange={e=>change({reforgeCount:Number(e.target.value)})}/></label></div><label>詞綴（逗號分隔）<input disabled={!item} value={item?.affixes?.join(",") ?? ""} onChange={e=>change({affixes:e.target.value.split(",").map(value=>value.trim()).filter(Boolean)})}/></label></article>;})}</div></div> : <div className="admin-form-grid"><label>金幣<input type="number" min="0" value={save.gold ?? 0} onChange={(e) => update("gold", Number(e.target.value))} /></label><label>元寶<input type="number" min="0" value={save.yuanbao ?? 0} onChange={(e) => update("yuanbao", Number(e.target.value))} /></label><label>強化石<input type="number" min="0" value={save.enhanceStones ?? 0} onChange={(e) => update("enhanceStones", Number(e.target.value))} /></label><label>洗鍊石<input type="number" min="0" value={save.reforgeStones ?? 0} onChange={(e) => update("reforgeStones", Number(e.target.value))} /></label><label>Boss 門票<input type="number" min="0" value={save.bossTickets ?? 0} onChange={(e) => update("bossTickets", Number(e.target.value))} /></label><label>世界首領次數<input type="number" min="0" value={save.worldAttempts ?? 0} onChange={(e) => update("worldAttempts", Number(e.target.value))} /></label><label>離線掛機秒數<input type="number" min="0" max="43200" value={Number(save.storedSeconds ?? 0)} onChange={(e) => update("storedSeconds", Number(e.target.value))} /></label></div>}
    <button className="btn" disabled={loading || saving || !accountId} onClick={()=>void loadSave(accountId)}>重新讀取雲端存檔</button>
    <button className="btn btn-danger" disabled={!accountId || saving || loading || loadedAccountId!==accountId} onClick={() => void saveEdit()}>{saving ? "儲存中……" : "確認修改並儲存"}</button>
  </section>;
}

export function AdminPermissionsPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [players, setPlayers] = useState<{
    accountId: string;
    username: string;
    playerName: string;
    level: number;
  }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [resource, setResource] = useState("gold");
  const [amount, setAmount] = useState("100");
  const [granting, setGranting] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "permissions_failed");
      const onlinePlayers = result.database?.onlinePlayers ?? [];
      setPlayers(onlinePlayers);
      setSelectedAccountId((current) =>
        onlinePlayers.some((player: { accountId: string }) => player.accountId === current)
          ? current
          : onlinePlayers[0]?.accountId ?? "",
      );
    } catch {
      setError("目前無法取得在線人員");
    } finally {
      setLoading(false);
    }
  }, []);
  useAdminLoad(refresh);
  return (
    <section className="admin-tab-panel">
        <p className="admin-tab-description">僅可對在線人員發放資源；會建立修改前備份、立即寫入並登出目標玩家。</p>
        {loading && <p>讀取中……</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && (
          <div className="admin-grant-panel">
            <label>
              在線的指定人員
              <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
                {players.length ? players.map((player) => (
                  <option key={player.accountId} value={player.accountId}>
                    {player.username} · {player.playerName} · Lv.{player.level}
                  </option>
                )) : <option value="">目前沒有在線人員</option>}
              </select>
            </label>
            <label>
              給予項目
              <select value={resource} onChange={(event) => setResource(event.target.value)}>
                <option value="gold">金幣</option>
                <option value="yuanbao">元寶</option>
                <option value="level">提升 1 級</option>
                <option value="enhanceStones">強化石</option>
                <option value="reforgeStones">洗鍊石</option>
              </select>
            </label>
            <label>
              數量
              <input
                type="number"
                min="1"
                max={resource === "level" ? 1 : 1000000000}
                value={resource === "level" ? "1" : amount}
                disabled={resource === "level"}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={granting || !selectedAccountId || !players.length}
              onClick={async () => {
                setGranting(true);
                try {
                  const response = await fetch("/api/admin/grant", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ accountId: selectedAccountId, resource, amount: resource === "level" ? 1 : Number(amount) }),
                  });
                  if (!response.ok) throw new Error();
                  toast.success("GM 給予成功");
                  await refresh();
                } catch {
                  toast.error("GM 給予失敗", { description: "指定人員可能已離線，請重新整理名單。" });
                } finally {
                  setGranting(false);
                }
              }}
            >
              {granting ? "處理中……" : "確認給予"}
            </button>
          </div>
        )}
        <button className="btn btn-primary" onClick={() => void refresh()} disabled={loading}>重新整理在線名單</button>
    </section>
  );
}

export function AdminPlayerManagement({initialQuery="",onEdit,onSnapshots}:{initialQuery?:string;onEdit?:(id:string)=>void;onSnapshots?:(id:string)=>void}={}) {
  type Player = {
    accountId: string; username: string; playerName: string; playerClass: string | null; level: number | null;
    combatPower: number; updatedAt: string | null;rebirthCount:number;mapIndex:number|null;floor:number|null;
    suspension: { reason: string; until: string | null; at: string } | null;
  };
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const generation=useRef(0);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [pendingMail, setPendingMail] = useState<Player | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Player | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [reason, setReason] = useState("違反遊戲規範");
  const [suspendUntil, setSuspendUntil] = useState(() => adminLocalDateTime(new Date(Date.now() + 7 * 24 * 60 * 60_000)));
  const [logs, setLogs] = useState<{ id: number; action: string; detail: string; createdAt: string; gmUsername: string | null }[]>([]);
  const refresh = useCallback(async () => {
    const token=++generation.current;setLoading(true);
    try {
      const [playersResponse, logsResponse] = await Promise.all([
        fetch(`/api/admin/players?q=${encodeURIComponent(query)}`, { cache: "no-store" }),
        fetch("/api/admin/player-control", { cache: "no-store" }),
      ]);
      const playerResult = await playersResponse.json().catch(() => ({}));
      const logResult = await logsResponse.json().catch(() => ({}));
      if (!playersResponse.ok || !logsResponse.ok) throw new Error("load_failed");
      if(token!==generation.current)return;setPlayers(playerResult.players ?? []);
      setLogs(logResult.logs ?? []);
    } catch {
      toast.error("目前無法取得玩家管理資料");
    } finally { if(token===generation.current)setLoading(false); }
  }, [query]);
  useAdminLoad(refresh);
  const control = async (accountId: string, action: "logout" | "suspend" | "unsuspend", mode?: "temporary" | "permanent") => {
    setWorkingId(accountId);
    try {
      const until = action==="suspend" && mode==="temporary" ? new Date(suspendUntil).toISOString() : undefined;
      const response = await fetch("/api/admin/player-control", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, action, mode, until, reason }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "control_failed");
      toast.success(action === "logout" ? "已強制登出玩家" : action === "unsuspend" ? "已解除停權" : mode === "permanent" ? "已永久停權" : "已暫時停權");
      await refresh();
    } catch {
      toast.error("操作失敗", { description: "請確認原因已填寫，然後再試一次。" });
    } finally { setWorkingId(""); }
  };
  const deleteAccount = async () => {
    if (!pendingDelete || workingId) return;
    const target = pendingDelete;
    setWorkingId(target.accountId);
    try {
      const response = await fetch("/api/admin/player-control", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accountId:target.accountId,action:"delete",confirmation:deleteConfirmation,reason:deleteReason})});
      const result = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(result.error ?? "delete_failed");
      setPendingDelete(null);setDeleteConfirmation("");setDeleteReason("");
      toast.success(`已刪除帳號 ${target.username}`);
      await refresh();
    } catch { toast.error("刪除失敗",{description:"請確認帳號名稱與刪除原因，或重新整理後再試。"}); }
    finally {setWorkingId("");}
  };
  return (
    <section className="admin-tab-panel">
      <p className="admin-tab-description">停權會保留角色與裝備資料、立即登出所有舊視窗，並拒絕後續登入。暫時停權預設為 7 天。</p>
      <label className="admin-search">
        搜尋帳號或角色名稱
        <input value={query} onChange={(event) => {generation.current++;setQuery(event.target.value);}} placeholder="輸入後自動搜尋" />
      </label>
      <label className="admin-search">
        停權原因
        <input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} />
      </label>
      <label className="admin-search">
        暫時停權至
        <input type="datetime-local" value={suspendUntil} onChange={(event) => setSuspendUntil(event.target.value)} />
      </label>
      {loading ? <p>讀取中……</p> : (
        <div className="gm-player-list">
          {players.length ? players.map((player) => (
            <article key={player.accountId} className="gm-player-card">
              <div>
                <strong>{player.username}</strong><span>{player.playerName} · {player.playerClass ?? "未選職業"} · {player.rebirthCount ?? 0} 轉 · Lv.{player.level ?? 0}</span>
                <small>上次存檔戰力 {player.combatPower.toLocaleString()} · 地圖 {player.mapIndex ?? "—"}／{player.floor ?? "—"} 層 · 最近存檔 {player.updatedAt ? new Date(player.updatedAt).toLocaleString("zh-TW") : "無"}</small>
                {player.suspension && <b className="suspension-status">{player.suspension.until ? `停權至 ${new Date(player.suspension.until).toLocaleString("zh-TW")}` : "永久停權"}：{player.suspension.reason}</b>}
              </div>
              <div className="gm-player-actions">
                {onEdit && <button className="btn" disabled={Boolean(workingId)} onClick={()=>onEdit(player.accountId)}>編輯存檔</button>}{onSnapshots && <button className="btn" disabled={Boolean(workingId)} onClick={()=>onSnapshots(player.accountId)}>查看快照</button>}
                {player.suspension ? <button className="btn btn-primary" disabled={Boolean(workingId)} onClick={() => void control(player.accountId, "unsuspend")}>解除停權</button> : <>
                  <button className="btn" disabled={Boolean(workingId)} onClick={() => void control(player.accountId, "logout")}>強制登出</button>
                  <button className="btn btn-danger" disabled={Boolean(workingId)} onClick={() => void control(player.accountId, "suspend", "temporary")}>暫時停權</button>
                  <button className="btn btn-danger" disabled={Boolean(workingId)} onClick={() => void control(player.accountId, "suspend", "permanent")}>永久停權</button>
                </>}
                <button className="btn" disabled={Boolean(workingId)} onClick={()=>setPendingMail(player)}>寄送郵件</button>
                <button className="btn btn-danger" disabled={Boolean(workingId)} onClick={()=>{setPendingDelete(player);setDeleteConfirmation("");setDeleteReason("");}}>刪除帳號</button>
              </div>
            </article>
          )) : <p className="death-hotspot-empty">沒有符合條件的玩家。</p>}
        </div>
      )}
      {pendingMail && <AdminMailComposer key={pendingMail.accountId} accountId={pendingMail.accountId} username={pendingMail.username} onClose={()=>{setPendingMail(null);void refresh();}} />}
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open)=>{if(!open && !workingId)setPendingDelete(null);}}>
        <AlertDialogContent className="sale-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>刪除帳號 {pendingDelete?.username}？</AlertDialogTitle>
            <AlertDialogDescription>將刪除登入帳號、目前角色存檔及帳號綁定的輪迴獎勵資格，立即登出所有視窗。歷史快照與操作紀錄會保留供查核；此功能沒有一鍵復原。同名重新註冊會是全新帳號。</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="admin-search">刪除原因<input value={deleteReason} maxLength={200} onChange={event=>setDeleteReason(event.target.value)} disabled={Boolean(workingId)} /></label>
          <label className="admin-search">輸入完整帳號名稱以確認<input value={deleteConfirmation} autoComplete="off" onChange={event=>setDeleteConfirmation(event.target.value)} disabled={Boolean(workingId)} /></label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(workingId)}>取消</AlertDialogCancel>
            <AlertDialogAction className="btn-danger" disabled={Boolean(workingId)||!deleteReason.trim()||deleteConfirmation!==pendingDelete?.username} onClick={event=>{event.preventDefault();void deleteAccount();}}>{workingId ? "刪除中……" : "永久刪除帳號"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="gm-log-panel">
        <div className="section-head"><h3>最近 GM 操作紀錄</h3><button className="btn" onClick={() => void refresh()} disabled={loading}>重新整理</button></div>
        {logs.length ? <ol className="death-hotspot-list">{logs.map((log) => <li key={log.id}><span>{log.gmUsername ?? "系統"} · {log.detail}</span><b>{new Date(log.createdAt).toLocaleString("zh-TW")}</b></li>)}</ol> : <p className="death-hotspot-empty">尚無操作紀錄。</p>}
      </div>
    </section>
  );
}

export function AdminSaveRestore({initialAccountId=""}:{initialAccountId?:string}={}) {
  type Player = { accountId: string; username: string; playerName: string; level: number | null };
  type Snapshot = {
    id: number; kind: string; capturedAt: string;
    preview: { playerName: string; playerClass: string; level: number; rebirthCount: number; combatPower: number; mapId: number; wave: number; gold: number; yuanbao: number; equipmentCount: number } | null;
  };
  type GlobalSnapshot = { id: number; kind: string; capturedAt: string; globalSaveCount: number };
  const [players, setPlayers] = useState<Player[]>([]);
  const [accountId, setAccountId] = useState(initialAccountId);
  const loadGeneration=useRef(0);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [globalSnapshots, setGlobalSnapshots] = useState<GlobalSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<(Snapshot & {accountId:string}) | null>(null);
  const loadPlayers = useCallback(async () => {
    const response = await fetch("/api/admin/players", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "players_failed");
    const next = result.players ?? [];
    setPlayers(next);
    setAccountId((current) => next.some((player: Player) => player.accountId === current) ? current : next[0]?.accountId ?? "");
  }, []);
  const loadSnapshots = useCallback(async (targetAccountId: string) => {
    if (!targetAccountId) { setSnapshots([]); setGlobalSnapshots([]); return; }
    const generation=++loadGeneration.current;
    const response = await fetch(`/api/admin/save-snapshots?accountId=${encodeURIComponent(targetAccountId)}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "snapshots_failed");
    if(generation!==loadGeneration.current)return;setSnapshots(result.snapshots ?? []);
    setGlobalSnapshots(result.globalSnapshots ?? []);
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadPlayers();
      if (accountId) await loadSnapshots(accountId);
    } catch { toast.error("目前無法取得存檔還原資料"); }
    finally { setLoading(false); }
  }, [accountId, loadPlayers, loadSnapshots]);
  useAdminLoad(refresh);

  useEffect(() => {
    if (!accountId) return;
    const timer = window.setInterval(() => {
      void loadSnapshots(accountId).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [accountId, loadSnapshots]);
  const restore = async () => {
    if (!pendingRestore || !accountId || pendingRestore.accountId!==accountId || restoring) return;
    setRestoring(true);
    try {
      const response = await fetch("/api/admin/save-snapshots", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, snapshotId: pendingRestore.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "restore_failed");
      toast.success("存檔已還原", { description: "已建立還原前備份，玩家已強制登出。" });
      setPendingRestore(null);
      await loadSnapshots(accountId);
    } catch { toast.error("存檔還原失敗"); }
    finally { setRestoring(false); }
  };
  return (
    <section className="admin-tab-panel">
      <p className="admin-tab-description">伺服器會從正式存檔每 5 分鐘建立快照，每位玩家保留最近 24 份；此頁每 30 秒自動更新。還原前會備份當前狀態並強制登出目標玩家。</p>
      <label className="admin-search">
        選擇玩家
        <select value={accountId} disabled={restoring} onChange={(event) => {loadGeneration.current++;setSnapshots([]);setGlobalSnapshots([]);setPendingRestore(null);setAccountId(event.target.value);}}>
          {players.length ? players.map((player) => <option key={player.accountId} value={player.accountId}>{player.username} · {player.playerName} · Lv.{player.level ?? 0}</option>) : <option value="">目前沒有玩家</option>}
        </select>
      </label>
      {loading ? <p>讀取中……</p> : <>
      {globalSnapshots.length > 0 && <div className="snapshot-list">
        <h3>大清洗前全域備份</h3>
        {globalSnapshots.map((snapshot) => <article className="snapshot-card" key={snapshot.id}>
          <div><strong>全域備份（永久保留）</strong><span>{new Date(snapshot.capturedAt).toLocaleString("zh-TW")}</span><small>包含 {snapshot.globalSaveCount} 份玩家存檔；不會隨自動快照清理。</small></div>
        </article>)}
      </div>}
      {snapshots.length ? <div className="snapshot-list">
        {snapshots.map((snapshot) => <article className="snapshot-card" key={snapshot.id}>
          <div>
            <strong>{snapshot.kind.startsWith("pre_global_reset:") ? "全服重置前備份" : snapshot.kind === "pre_restore" ? "還原前備份" : snapshot.kind === "pre_admin_edit" ? "管理員修改前備份" : "自動快照"}</strong>
            <span>{new Date(snapshot.capturedAt).toLocaleString("zh-TW")}</span>
            {snapshot.preview ? <small>{snapshot.preview.playerClass} · {snapshot.preview.rebirthCount} 轉 · Lv.{snapshot.preview.level} · 戰力 {snapshot.preview.combatPower.toLocaleString()} · 地圖 {snapshot.preview.mapId}／第 {snapshot.preview.wave} 層 · 倉庫裝備 {snapshot.preview.equipmentCount} 件<br />金幣 {snapshot.preview.gold.toLocaleString()} · 元寶 {snapshot.preview.yuanbao.toLocaleString()}</small> : <small>此備份資料格式無法預覽，但仍可由 GM 還原。</small>}
          </div>
          <button className="btn btn-danger" disabled={restoring || loading} onClick={() => setPendingRestore({...snapshot,accountId})}>還原此版本</button>
        </article>)}
      </div> : <p className="death-hotspot-empty">目前尚無可還原的快照。玩家在線時，伺服器會依正式存檔定時建立快照。</p>}
      </>}
      <button className="btn btn-primary" onClick={() => void refresh()} disabled={loading}>重新整理</button>
      <AlertDialog open={Boolean(pendingRestore)} onOpenChange={(open) => { if (!open && !restoring) setPendingRestore(null); }}>
        <AlertDialogContent className="sale-dialog">
          <AlertDialogHeader><AlertDialogTitle>確認還原玩家存檔？</AlertDialogTitle><AlertDialogDescription>將還原至 {pendingRestore ? new Date(pendingRestore.capturedAt).toLocaleString("zh-TW") : ""}。目前狀態會先備份，目標玩家會立即登出。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={restoring}>取消</AlertDialogCancel><AlertDialogAction className="btn-danger" disabled={restoring} onClick={(event) => { event.preventDefault(); void restore(); }}>{restoring ? "還原中……" : "確認還原"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
