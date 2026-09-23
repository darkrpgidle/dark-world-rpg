"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import { maps, skillsByClass, type GameClass } from "./game-data";
import { ALL_CATALOG_EQUIPMENT } from "./mythic-data";

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
  const [activeTab, setActiveTab] = useState<"overview" | "players" | "snapshots" | "editor" | "grants">("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState(false);
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
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sale-dialog">
        <DialogHeader>
          <DialogTitle>GM 管理</DialogTitle>
          <DialogDescription>監控、玩家管理與資源發放皆由伺服器端驗證。</DialogDescription>
        </DialogHeader>
        <div className="gm-tabs" role="tablist" aria-label="GM 管理分頁">
          <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>監控總覽</button>
          <button className={activeTab === "players" ? "active" : ""} onClick={() => setActiveTab("players")}>玩家管理</button>
          <button className={activeTab === "snapshots" ? "active" : ""} onClick={() => setActiveTab("snapshots")}>存檔還原</button>
          <button className={activeTab === "editor" ? "active" : ""} onClick={() => setActiveTab("editor")}>指定玩家存檔修改</button>
          <button className={activeTab === "grants" ? "active" : ""} onClick={() => setActiveTab("grants")}>資源發放</button>
        </div>
        {activeTab === "overview" && <>
          {loading && <p>讀取中……</p>}
          {error && <p className="error-text">{error}</p>}
          {overview && !loading && (
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
          <button
          className="btn btn-danger"
          disabled={loading || resetting}
          onClick={async () => {
            setResetting(true);
            try {
              const response = await fetch("/api/admin/reset", { method: "POST" });
              const result = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(result.error ?? "reset_failed");
              toast.success("玩家資料已重置", { description: "GM 帳號已保留，其他玩家帳號與存檔已清除。" });
              await refresh();
            } catch {
              toast.error("玩家資料重置失敗");
            } finally {
              setResetting(false);
            }
          }}
          >
            {resetting ? "重置中……" : "重置所有玩家資料"}
          </button>
        </>}
        {activeTab === "players" && <AdminPlayerManagement />}
        {activeTab === "snapshots" && <AdminSaveRestore />}
        {activeTab === "editor" && <AdminSaveEditor />}
        {activeTab === "grants" && <AdminPermissionsPanel />}
      </DialogContent>
    </Dialog>
  );
}

export function AdminSaveEditor() {
  const slots = EQUIPMENT_SLOTS;
  const [players, setPlayers] = useState<{ accountId: string; username: string; playerName: string; level: number | null }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [page, setPage] = useState<"character" | "equipment" | "resources">("character");
  const [save, setSave] = useState<Record<string, any>>({ playerName: "", playerClass: "戰士", rebirthCount: 0, level: 1, exp: 0, mapId: 1, unlockedMapId: 1, highestFloor: 1, skillPoints: 0, gold: 0, yuanbao: 0, enhanceStones: 0, reforgeStones: 0, items: [], skills: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const update = (key: string, value: any) => setSave((old) => ({ ...old, [key]: value }));
  const loadPlayers = useCallback(async () => {
    const r = await fetch("/api/admin/players", { cache: "no-store" }); const data = await r.json();
    const list = data.players ?? []; setPlayers(list); if (!accountId && list[0]) setAccountId(list[0].accountId);
  }, [accountId]);
  const loadSave = useCallback(async (id: string) => {
    if (!id) return; setLoading(true);
    try { const r = await fetch(`/api/admin/edit-save?accountId=${encodeURIComponent(id)}`, { cache: "no-store" }); const data = await r.json(); if (!r.ok) throw new Error(); setSave(data.save ?? { playerName: data.account?.username ?? "", playerClass: "戰士", rebirthCount: 0, level: 1, exp: 0, mapId: 1, unlockedMapId: 1, highestFloor: 1, skillPoints: 0, gold: 0, yuanbao: 0, enhanceStones: 0, reforgeStones: 0, items: [], skills: [] }); } catch { toast.error("無法讀取指定玩家存檔"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadPlayers(); }, [loadPlayers]);
  useEffect(() => { void loadSave(accountId); }, [accountId, loadSave]);
  const saveEdit = async () => {
    setSaving(true);
    try { const r = await fetch("/api/admin/edit-save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, save }) }); if (!r.ok) throw new Error(); const data = await r.json(); setSave(data.save); toast.success("指定玩家存檔修改成功", { description: "已建立修改前備份、強制登出玩家並重新計算排行榜。" }); } catch { toast.error("存檔修改失敗"); } finally { setSaving(false); }
  };
  const items = Array.isArray(save.items) ? save.items : [];
  return <section className="admin-tab-panel">
    <p className="admin-tab-description">修改前會自動建立備份；儲存後強制登出玩家，避免舊視窗覆蓋修改內容。</p>
    <label className="admin-search">指定玩家<select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{players.map((p) => <option key={p.accountId} value={p.accountId}>{p.username} · {p.playerName} · Lv.{p.level ?? 0}</option>)}</select></label>
    <div className="gm-tabs" role="tablist" aria-label="指定玩家存檔修改分頁">
      <button className={page === "character" ? "active" : ""} onClick={() => setPage("character")}>角色與進度</button><button className={page === "equipment" ? "active" : ""} onClick={() => setPage("equipment")}>十件裝備</button><button className={page === "resources" ? "active" : ""} onClick={() => setPage("resources")}>資源</button>
    </div>
    {loading ? <p>讀取中……</p> : page === "character" ? <div className="admin-form-grid">
      <label>角色名稱<input value={save.playerName ?? ""} onChange={(e) => update("playerName", e.target.value)} /></label><label>職業<select value={save.playerClass ?? "戰士"} onChange={(e) => update("playerClass", e.target.value)}><option>戰士</option><option>遊俠</option><option>法師</option></select></label>
      <label>轉生次數<input type="number" min="0" max="20" value={save.rebirthCount ?? 0} onChange={(e) => update("rebirthCount", Number(e.target.value))} /></label><label>等級<input type="number" min="1" max="100" value={save.level ?? 1} onChange={(e) => update("level", Number(e.target.value))} /></label><label>經驗值<input type="number" min="0" value={save.exp ?? 0} onChange={(e) => update("exp", Number(e.target.value))} /></label><label>技能點<input type="number" min="0" value={save.skillPoints ?? 0} onChange={(e) => update("skillPoints", Number(e.target.value))} /></label><p className="admin-tab-description admin-wide">輪迴天賦點會依輪迴數自動同步：每 1 轉提供 2 點；已投入的天賦點會保留，剩餘點數自動回填。</p>
      <label>當前地圖<select value={save.mapId ?? 1} onChange={(e) => update("mapId", Number(e.target.value))}>{maps.map((map) => <option key={map.id} value={map.id}>{map.id}. {map.name}</option>)}</select></label><label>解鎖地圖<select value={save.unlockedMapId ?? 1} onChange={(e) => update("unlockedMapId", Number(e.target.value))}>{maps.map((map) => <option key={map.id} value={map.id}>{map.id}. {map.name}</option>)}</select></label><label>最高通關層數<select value={save.highestFloor ?? 1} onChange={(e) => update("highestFloor", Number(e.target.value))}>{Array.from({ length: 30 }, (_, index) => index + 1).map((floor) => <option key={floor} value={floor}>第 {floor} 層</option>)}</select></label><label>最終首領<input type="checkbox" checked={Boolean(save.finalBossDefeated)} onChange={(e) => update("finalBossDefeated", e.target.checked)} /></label>
      <div className="admin-wide"><strong>各地圖最高通關層數</strong><div className="admin-form-grid">{maps.map((map) => <label key={map.id}>{map.name}<select value={Number(save.mapBestFloors?.[String(map.id)] ?? 0)} onChange={(e) => update("mapBestFloors", { ...(save.mapBestFloors ?? {}), [String(map.id)]: Number(e.target.value) })}><option value="0">未通關</option>{Array.from({ length: 30 }, (_, index) => index + 1).map((floor) => <option key={floor} value={floor}>第 {floor} 層</option>)}</select></label>)}</div></div>
      <div className="admin-wide"><strong>技能等級</strong><div className="admin-form-grid">{(skillsByClass[save.playerClass as GameClass] ?? skillsByClass.戰士).map((skill) => { const current = Array.isArray(save.skills) ? save.skills.find((entry: Record<string, unknown>) => entry.name === skill.name) : null; return <label key={skill.name}>{skill.name}<select value={Number(current?.level ?? 0)} onChange={(e) => { const next = Array.isArray(save.skills) ? [...save.skills] : []; const index = next.findIndex((entry: Record<string, unknown>) => entry.name === skill.name); const value = { name: skill.name, level: Number(e.target.value), unlocked: Number(e.target.value) > 0 }; if (index >= 0) next[index] = { ...next[index], ...value }; else next.push(value); update("skills", next); }}>{Array.from({ length: skill.max + 1 }, (_, level) => <option key={level} value={level}>Lv.{level}</option>)}</select></label>; })}</div></div>
    </div> : page === "equipment" ? <div><div className="admin-equipment-grid">{slots.map((slot, index) => { const item = items[index] ?? { name: "", quality: "普通", enhance: 0, reforgeLevel: 0, affixes: [] }; const options = EQUIPMENT_OPTIONS_BY_SLOT[slot] ?? []; return <article className="admin-equipment-card" key={slot}><strong>{slot}</strong><select value={item.name ?? ""} onChange={(e) => { const next = [...items]; next[index] = { ...item, slot, name: e.target.value }; update("items", next); }}><option value="">未裝備</option>{options.map((option) => <option key={`${option.map}-${option.name}`} value={option.name}>{option.name} · {option.map}</option>)}</select><div><label>品質<select value={item.quality ?? "普通"} onChange={(e) => { const next = [...items]; next[index] = { ...item, slot, quality: e.target.value }; update("items", next); }}><option>普通</option><option>良好</option><option>優秀</option><option>史詩</option><option>傳奇</option><option>神話</option></select></label><label>強化<input type="number" min="0" max="15" value={item.enhance ?? 0} onChange={(e) => { const next = [...items]; next[index] = { ...item, slot, enhance: Number(e.target.value) }; update("items", next); }} /></label><label>洗鍊<input type="number" min="0" value={item.reforgeLevel ?? 0} onChange={(e) => { const next = [...items]; next[index] = { ...item, slot, reforgeLevel: Number(e.target.value) }; update("items", next); }} /></label></div><input placeholder="詞綴，以逗號分隔" value={Array.isArray(item.affixes) ? item.affixes.join(",") : ""} onChange={(e) => { const next = [...items]; next[index] = { ...item, slot, affixes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }; update("items", next); }} /></article>; })}</div></div> : <div className="admin-form-grid"><label>金幣<input type="number" min="0" value={save.gold ?? 0} onChange={(e) => update("gold", Number(e.target.value))} /></label><label>元寶<input type="number" min="0" value={save.yuanbao ?? 0} onChange={(e) => update("yuanbao", Number(e.target.value))} /></label><label>強化石<input type="number" min="0" value={save.enhanceStones ?? 0} onChange={(e) => update("enhanceStones", Number(e.target.value))} /></label><label>洗鍊石<input type="number" min="0" value={save.reforgeStones ?? 0} onChange={(e) => update("reforgeStones", Number(e.target.value))} /></label><label>Boss 門票<input type="number" min="0" value={save.bossTickets ?? 0} onChange={(e) => update("bossTickets", Number(e.target.value))} /></label><label>世界首領次數<input type="number" min="0" value={save.worldAttempts ?? 0} onChange={(e) => update("worldAttempts", Number(e.target.value))} /></label><label>離線掛機秒數<input type="number" min="0" value={save.idleSeconds ?? 0} onChange={(e) => update("idleSeconds", Number(e.target.value))} /></label></div>}
    <button className="btn btn-danger" disabled={!accountId || saving} onClick={() => void saveEdit()}>{saving ? "儲存中……" : "確認修改並儲存"}</button>
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
  useEffect(() => { void refresh(); }, [refresh]);
  return (
    <section className="admin-tab-panel">
        <p className="admin-tab-description">僅可對在線人員發放資源；每一筆給予都會在玩家存檔中立即生效。</p>
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

export function AdminPlayerManagement() {
  type Player = {
    accountId: string; username: string; playerName: string; playerClass: string | null; level: number | null;
    combatPower: number; updatedAt: string | null;
    suspension: { reason: string; until: string | null; at: string } | null;
  };
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [reason, setReason] = useState("違反遊戲規範");
  const [suspendUntil, setSuspendUntil] = useState(() => new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString().slice(0, 16));
  const [logs, setLogs] = useState<{ id: number; action: string; detail: string; createdAt: string; gmUsername: string | null }[]>([]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [playersResponse, logsResponse] = await Promise.all([
        fetch(`/api/admin/players?q=${encodeURIComponent(query)}`, { cache: "no-store" }),
        fetch("/api/admin/player-control", { cache: "no-store" }),
      ]);
      const playerResult = await playersResponse.json().catch(() => ({}));
      const logResult = await logsResponse.json().catch(() => ({}));
      if (!playersResponse.ok || !logsResponse.ok) throw new Error("load_failed");
      setPlayers(playerResult.players ?? []);
      setLogs(logResult.logs ?? []);
    } catch {
      toast.error("目前無法取得玩家管理資料");
    } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { void refresh(); }, [refresh]);
  const control = async (accountId: string, action: "logout" | "suspend" | "unsuspend", mode?: "temporary" | "permanent") => {
    setWorkingId(accountId);
    try {
      const until = new Date(suspendUntil).toISOString();
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
  return (
    <section className="admin-tab-panel">
      <p className="admin-tab-description">停權會保留角色與裝備資料、立即登出所有舊視窗，並拒絕後續登入。暫時停權預設為 7 天。</p>
      <label className="admin-search">
        搜尋帳號或角色名稱
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入後自動搜尋" />
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
                <strong>{player.username}</strong><span>{player.playerName} · {player.playerClass ?? "未選職業"} · Lv.{player.level ?? 0}</span>
                <small>戰力 {player.combatPower.toLocaleString()} · 最近存檔 {player.updatedAt ? new Date(player.updatedAt).toLocaleString("zh-TW") : "無"}</small>
                {player.suspension && <b className="suspension-status">{player.suspension.until ? `停權至 ${new Date(player.suspension.until).toLocaleString("zh-TW")}` : "永久停權"}：{player.suspension.reason}</b>}
              </div>
              <div className="gm-player-actions">
                {player.suspension ? <button className="btn btn-primary" disabled={workingId === player.accountId} onClick={() => void control(player.accountId, "unsuspend")}>解除停權</button> : <>
                  <button className="btn" disabled={workingId === player.accountId} onClick={() => void control(player.accountId, "logout")}>強制登出</button>
                  <button className="btn btn-danger" disabled={workingId === player.accountId} onClick={() => void control(player.accountId, "suspend", "temporary")}>暫時停權</button>
                  <button className="btn btn-danger" disabled={workingId === player.accountId} onClick={() => void control(player.accountId, "suspend", "permanent")}>永久停權</button>
                </>}
              </div>
            </article>
          )) : <p className="death-hotspot-empty">沒有符合條件的玩家。</p>}
        </div>
      )}
      <div className="gm-log-panel">
        <div className="section-head"><h3>最近 GM 操作紀錄</h3><button className="btn" onClick={() => void refresh()} disabled={loading}>重新整理</button></div>
        {logs.length ? <ol className="death-hotspot-list">{logs.map((log) => <li key={log.id}><span>{log.gmUsername ?? "GM"} · {log.detail}</span><b>{new Date(log.createdAt).toLocaleString("zh-TW")}</b></li>)}</ol> : <p className="death-hotspot-empty">尚無操作紀錄。</p>}
      </div>
    </section>
  );
}

export function AdminSaveRestore() {
  type Player = { accountId: string; username: string; playerName: string; level: number | null };
  type Snapshot = {
    id: number; kind: string; capturedAt: string;
    preview: { playerName: string; playerClass: string; level: number; rebirthCount: number; combatPower: number; mapId: number; wave: number; gold: number; yuanbao: number; equipmentCount: number } | null;
  };
  type GlobalSnapshot = { id: number; kind: string; capturedAt: string; globalSaveCount: number };
  const [players, setPlayers] = useState<Player[]>([]);
  const [accountId, setAccountId] = useState("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [globalSnapshots, setGlobalSnapshots] = useState<GlobalSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<Snapshot | null>(null);
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
    const response = await fetch(`/api/admin/save-snapshots?accountId=${encodeURIComponent(targetAccountId)}`, { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "snapshots_failed");
    setSnapshots(result.snapshots ?? []);
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
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    void loadSnapshots(accountId).catch(() => toast.error("目前無法取得該玩家的備份")).finally(() => setLoading(false));
  }, [accountId, loadSnapshots]);
  useEffect(() => {
    if (!accountId) return;
    const timer = window.setInterval(() => {
      void loadSnapshots(accountId).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [accountId, loadSnapshots]);
  const restore = async () => {
    if (!pendingRestore || !accountId) return;
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
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
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
            <strong>{snapshot.kind === "pre_restore" ? "還原前備份" : snapshot.kind === "pre_admin_edit" ? "管理員修改前備份" : "自動快照"}</strong>
            <span>{new Date(snapshot.capturedAt).toLocaleString("zh-TW")}</span>
            {snapshot.preview ? <small>{snapshot.preview.playerClass} · {snapshot.preview.rebirthCount} 轉 · Lv.{snapshot.preview.level} · 戰力 {snapshot.preview.combatPower.toLocaleString()} · 地圖 {snapshot.preview.mapId}／第 {snapshot.preview.wave} 層 · 倉庫裝備 {snapshot.preview.equipmentCount} 件<br />金幣 {snapshot.preview.gold.toLocaleString()} · 元寶 {snapshot.preview.yuanbao.toLocaleString()}</small> : <small>此備份資料格式無法預覽，但仍可由 GM 還原。</small>}
          </div>
          <button className="btn btn-danger" onClick={() => setPendingRestore(snapshot)}>還原此版本</button>
        </article>)}
      </div> : <p className="death-hotspot-empty">目前尚無可還原的快照。玩家在線時，伺服器會依正式存檔定時建立快照。</p>}
      </>}
      <button className="btn btn-primary" onClick={() => void refresh()} disabled={loading}>重新整理</button>
      <AlertDialog open={Boolean(pendingRestore)} onOpenChange={(open) => { if (!open) setPendingRestore(null); }}>
        <AlertDialogContent className="sale-dialog">
          <AlertDialogHeader><AlertDialogTitle>確認還原玩家存檔？</AlertDialogTitle><AlertDialogDescription>將還原至 {pendingRestore ? new Date(pendingRestore.capturedAt).toLocaleString("zh-TW") : ""}。目前狀態會先備份，目標玩家會立即登出。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={restoring}>取消</AlertDialogCancel><AlertDialogAction className="btn-danger" disabled={restoring} onClick={(event) => { event.preventDefault(); void restore(); }}>{restoring ? "還原中……" : "確認還原"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
