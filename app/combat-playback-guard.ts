// Gameplay owns this lease; a Canvas mount/RAF/image load never owns recovery.
export const COMBAT_PLAYBACK_TIMEOUT_MS = 8000;
export class CombatPlaybackGuard {
  private lease: {key:number;deadline:number} | null = null;
  begin(key:number, now:number) {
    if(this.lease?.key===key)return;
    this.lease={key,deadline:now+COMBAT_PLAYBACK_TIMEOUT_MS};
  }
  complete(key:number) {
    if(this.lease?.key!==key)return false;
    this.lease=null;return true;
  }
  clear() { this.lease=null; }
  takeRecovery(now:number, visible:boolean) {
    if(!this.lease || visible && now<this.lease.deadline)return null;
    const key=this.lease.key;this.lease=null;return key;
  }
}
