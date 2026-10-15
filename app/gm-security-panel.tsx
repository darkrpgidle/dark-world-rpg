"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Search, ShieldAlert, Users, ClipboardList } from "lucide-react";
import { INTEGRITY_FIELD_LABELS, INTEGRITY_REASON_LABELS, integrityReasonLabel, type IntegrityChange } from "./save-integrity-audit";
type Log = {id:number;accountId:string|null;username:string|null;createdAt:string;reason:string;field?:string;changes:IntegrityChange[]};
type Data = {logs:Log[];total:number;nextCursor:number|null;summary:{last24Hours:number;accounts:number;reasons:{reason:string;value:number}[]}};
const date = (value:string)=>new Date(value.includes("T") ? value : value.replace(" ","T")+"Z").toLocaleString("zh-TW",{timeZone:"Asia/Taipei"});
const value = (value:string|number|null)=>value === null ? "未提供" : typeof value === "number" ? value.toLocaleString("zh-TW") : value;
export function GmSecurityPanel({onSelectPlayer}:{onSelectPlayer:(username:string)=>void}) {
 const [data,setData]=useState<Data|null>(null);const [q,setQ]=useState("");const [reason,setReason]=useState("");const [range,setRange]=useState("24h");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [expanded,setExpanded]=useState<number|null>(null);
 const generation=useRef(0);
 const invalidate=useCallback(()=>{generation.current++;},[]);
 const load=useCallback(async(cursor?:number)=>{
  const token=++generation.current;setBusy(true);setError("");
  try {
   const params=new URLSearchParams({q,reason,range});if(cursor)params.set("cursor",String(cursor));
   const response=await fetch(`/api/admin/security-logs?${params}`,{cache:"no-store"});
   const result=await response.json();if(!response.ok)throw new Error();
   if(token!==generation.current)return;
   setData(previous=>cursor && previous ? {...result,logs:[...previous.logs,...result.logs]} : result);
  } catch {if(token===generation.current)setError("無法讀取異常紀錄，請重新整理或確認 GM 登入狀態。");}
  finally {if(token===generation.current)setBusy(false);}
 },[q,reason,range]);
 useEffect(()=>{const timer=window.setTimeout(()=>void load(),250);return()=>{window.clearTimeout(timer);invalidate();};},[load,invalidate]);
 const filter=(change:()=>void)=>{generation.current++;setData(null);setExpanded(null);change();};
 const peak=Math.max(1,...(data?.summary.reasons.map(row=>row.value) ?? []));
 return <section className="admin-tab-panel gm-security-panel">
  <div className="gm-metrics">
   <article><ShieldAlert size={21}/><span>24 小時拒絕紀錄</span><strong>{data?.summary.last24Hours.toLocaleString() ?? "—"}</strong></article>
   <article><Users size={21}/><span>涉及帳號</span><strong>{data?.summary.accounts.toLocaleString() ?? "—"}</strong></article>
   <article><ClipboardList size={21}/><span>目前篩選結果</span><strong>{data?.total.toLocaleString() ?? "—"}</strong></article>
  </div>
  <p className="gm-notice">驗證失敗需人工核對，不能直接認定開掛。同帳號每分鐘最多保存一筆；以下為紀錄筆數。</p>
  <div className="gm-filter-bar">
   <label className="admin-search">搜尋帳號<div className="gm-search-field"><Search size={18}/><input value={q} maxLength={80} placeholder="帳號名稱或帳號 ID" onChange={e=>filter(()=>setQ(e.target.value))}/></div></label>
   <label className="admin-search">時間範圍<select value={range} onChange={e=>filter(()=>setRange(e.target.value))}><option value="24h">最近 24 小時</option><option value="7d">最近 7 天</option><option value="all">全部紀錄</option></select></label>
   <label className="admin-search">拒絕原因<select value={reason} onChange={e=>filter(()=>setReason(e.target.value))}><option value="">所有原因</option>{Object.entries(INTEGRITY_REASON_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <button className="btn" disabled={busy} onClick={()=>void load()}><RefreshCw size={17}/>重新整理</button>
  </div>
  {error && <p role="alert" className="error-text">{error}</p>}
  {data && data.summary.reasons.length>0 && <details className="gm-reason-breakdown"><summary>24 小時原因分布</summary><div>{data.summary.reasons.map(row=><div className="gm-reason-bar" key={row.reason}><span>{integrityReasonLabel(row.reason)}</span><meter min={0} max={peak} value={row.value}/><b>{row.value}</b></div>)}</div></details>}
  {!data && busy ? <p className="gm-empty">正在讀取驗證紀錄……</p> : data?.logs.length ? <div className="gm-audit-list">
   {data.logs.map(log=><article className="gm-audit-card" key={log.id}>
    <div className="gm-audit-main"><div className="gm-audit-icon"><ShieldAlert size={21}/></div><div><strong>{log.username ?? "帳號已移除"}<span className="gm-badge">寫入已拒絕</span></strong><p>{integrityReasonLabel(log.reason)}</p><small>{date(log.createdAt)} · 系統驗證</small></div>
     <div className="gm-audit-actions"><button className="btn" aria-expanded={expanded===log.id} onClick={()=>setExpanded(expanded===log.id ? null : log.id)}>查看差異</button><button className="btn" disabled={!log.username} onClick={()=>log.username && onSelectPlayer(log.username)}>查看玩家</button></div>
    </div>
    {expanded===log.id && <div className="gm-audit-detail"><p>原因代碼：<code>{log.reason}</code></p>{log.field && <p>拒絕欄位：<code>{log.field}</code></p>}<p>帳號 ID：<code>{log.accountId ?? "無"}</code></p>{log.changes.length ? <div className="gm-table-scroll"><table><thead><tr><th>欄位</th><th>雲端原值</th><th>提交值</th></tr></thead><tbody>{log.changes.map(change=><tr key={change.field}><th>{INTEGRITY_FIELD_LABELS[change.field] ?? ({items:"裝備筆數",mails:"郵件筆數",gemInventory:"寶石種類"} as Record<string,string>)[change.field] ?? change.field}</th><td>{value(change.before)}</td><td className="gm-submitted-value">{value(change.submitted)}</td></tr>)}</tbody></table></div> : <p>這筆紀錄沒有欄位差異。舊紀錄只保留原因，裝備內容變更也可能不改變筆數。</p>}</div>}
   </article>)}
  </div> : !error && !busy && <div className="gm-empty"><ShieldAlert size={32}/><strong>目前沒有符合條件的紀錄</strong><p>新發生的異常存檔會在此顯示。</p></div>}
  {data?.nextCursor && <button className="btn" disabled={busy} onClick={()=>void load(data.nextCursor!)}>{busy ? "讀取中……" : "載入更多紀錄"}</button>}
 </section>;
}
