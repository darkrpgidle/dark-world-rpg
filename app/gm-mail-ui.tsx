'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {toast} from 'sonner';
import {Mail} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import type {GmMail} from './gm-mail';
export function AdminMailComposer({accountId,username,onClose}:{accountId:string;username:string;onClose:()=>void}){
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[sending,setSending]=useState(false);
 const requestId=useRef(crypto.randomUUID());
 const send=async()=>{if(sending)return;setSending(true);try{const response=await fetch('/api/admin/mail',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,title,body,requestId:requestId.current})});const result=await response.json();if(!response.ok)throw new Error(result.error);toast.success('GM 郵件已寄出');onClose();}catch{toast.error('郵件未確認寄出',{description:'可以重試；重試不會重複寄送。若信箱已滿，請稍後再寄。'});}finally{setSending(false);}};
 return <Dialog open onOpenChange={open=>{if(!open&&!sending)onClose();}}><DialogContent className="sale-dialog"><DialogHeader><DialogTitle>寄送 GM 郵件給 {username}</DialogTitle><DialogDescription>純文字訊息，保留 7 天。離線玩家登入後也能收到，不附帶獎勵。</DialogDescription></DialogHeader><label className="admin-search">標題（最多 80 字）<input value={title} maxLength={80} disabled={sending} onChange={e=>{requestId.current=crypto.randomUUID();setTitle(e.target.value);}} /></label><label className="admin-search">內容（最多 2000 字）<textarea style={{minHeight:180,width:'100%'}} value={body} maxLength={2000} disabled={sending} onChange={e=>{requestId.current=crypto.randomUUID();setBody(e.target.value);}} /></label><button className="btn btn-primary" disabled={sending||!title.trim()||!body.trim()} onClick={()=>void send()}>{sending?'寄送中……':'寄送郵件'}</button></DialogContent></Dialog>;
}
export function useGmInbox(loginId:string){
 const [state,setState]=useState<{loginId:string;mails:GmMail[]}>({loginId,mails:[]}),[error,setError]=useState(false),[reading,setReading]=useState<number|null>(null);
 const mails=state.loginId===loginId?state.mails:[];
 const headers={'x-dark-world-login-id':loginId};
 const refresh=useCallback(async(signal?:AbortSignal)=>{try{const r=await fetch('/api/gm-inbox',{cache:'no-store',headers:{'x-dark-world-login-id':loginId},signal});if(!r.ok)throw new Error();const d=await r.json();if(!signal?.aborted){setState({loginId,mails:d.mails??[]});setError(false);}}catch{if(!signal?.aborted)setError(true);}},[loginId]);
 useEffect(()=>{const controller=new AbortController();const initial=setTimeout(()=>void refresh(controller.signal),0);const timer=setInterval(()=>void refresh(controller.signal),30000);return()=>{controller.abort();clearTimeout(initial);clearInterval(timer);};},[refresh]);
 const read=async(id:number)=>{if(reading!==null)return;setReading(id);try{const r=await fetch('/api/gm-inbox',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({id})});if(!r.ok)throw new Error();setState(old=>old.loginId===loginId?{...old,mails:old.mails.map(m=>m.id===id?{...m,read:true}:m)}:old);}catch{toast.error('目前無法標記已讀');}finally{setReading(null);}};
 return {mails,error,refresh,read,reading,unread:mails.filter(m=>!m.read).length};
}
export function GmInboxMessages({inbox}:{inbox:ReturnType<typeof useGmInbox>}){
 return <><div className="section-head"><h3>GM 訊息</h3><button className="btn" onClick={()=>void inbox.refresh()}>重新整理</button></div>{inbox.error&&<p role="alert">GM 郵件暫時無法讀取，請重新整理。</p>}{inbox.mails.map(m=><article key={`gm-${m.id}`} className={m.read?'claimed':''}><div className="mail-mark"><Mail /></div><div style={{minWidth:0}}><small>GM／系統管理員 · {m.read?'已讀':'未讀'} · {new Date(m.createdAt).toLocaleString('zh-TW')}</small><h3>{m.title}</h3><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</p></div><button className="btn btn-primary" disabled={m.read||inbox.reading!==null} onClick={()=>void inbox.read(m.id)}>{m.read?'已讀':'標記已讀'}</button></article>)}</>;
}
