export type VfxFrame = { left: number; top: number; width: number; height: number };
export type TitanStage = { width: number; height: number; player: VfxFrame; enemy: VfxFrame };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Canvas-local CSS pixels; portrait bottoms are the boundary above names and HP.
export function titanRiftPlacement(stage: TitanStage, _frame: number, main: boolean, aspect: number) {
  const { width, height, player, enemy } = stage;
  const padding = main ? Math.max(4, Math.min(8, width * 0.012)) : Math.min(14, width * 0.025);
  const safe = {
    left: padding, right: width - padding,
    top: Math.max(main ? 4 : padding, Math.min(player.top, enemy.top) - (main ? 28 : 8)),
    bottom: Math.min(height - padding, player.top + player.height, enemy.top + enemy.height),
  };
  const safeWidth = Math.max(1, safe.right - safe.left);
  const safeHeight = Math.max(1, safe.bottom - safe.top);
  const enemyX = enemy.left + enemy.width * 0.5;
  const enemyY = enemy.top + enemy.height * 0.5;
  const phaseScale = main ? 1.28 : 0.78;
  const desiredX = main ? width / 2 : enemyX;
  // Echoes stay on the target; the main atlas keeps its own fixed stage center.
  const maxDrift = Math.min(player.width, enemy.width) * (main ? 0.32 : 0.18);
  const localWidth = 2 * (Math.min(desiredX - safe.left, safe.right - desiredX) + maxDrift);
  const naturalHeight = Math.min(player.height, enemy.height) * phaseScale;
  const spriteHeight = Math.max(1, Math.min(naturalHeight, safeHeight * (main ? 0.99 : 0.94),
    safeWidth / aspect, Math.max(1, localWidth) / aspect));
  const spriteWidth = spriteHeight * aspect;
  const centerX = clamp(desiredX,
    safe.left + spriteWidth / 2, safe.right - spriteWidth / 2);
  const centerY = clamp(main ? (safe.top + safe.bottom) / 2 : enemyY,
    safe.top + spriteHeight / 2, safe.bottom - spriteHeight / 2);
  return {
    x: centerX - spriteWidth / 2, y: centerY - spriteHeight / 2,
    width: spriteWidth, height: spriteHeight, centerX, centerY,
    ringRadius: Math.min(spriteHeight * 0.42, centerX - safe.left, safe.right - centerX,
      centerY - safe.top, safe.bottom - centerY),
    safe,
  };
}

// A whole registered spirit behind the player, fixed through all attack poses.
export function titanSpiritPlacement(stage: TitanStage, ascended: boolean) {
  const size = stage.player.height * (ascended ? 3.35 : 3.0);
  const centerX = stage.player.left + stage.player.width * .36;
  const centerY = stage.player.top + stage.player.height * .12;
  return {x:centerX-size/2,y:centerY-size/2,width:size,height:size};
}
export function titanSlashPlacement(stage: TitanStage, ascended: boolean, echoIndex = 0) {
  const ax=stage.player.left+stage.player.width*.8, ay=stage.player.top+stage.player.height*.3;
  const bx=stage.enemy.left+stage.enemy.width*.52, by=stage.enemy.top+stage.enemy.height*.56;
  const width=Math.hypot(bx-ax,by-ay)*(ascended?1.55:1.35);
  const height=Math.min(stage.player.height,stage.enemy.height)*(ascended?1.15:.92);
  return {x:(ax+bx)/2-width/2,y:(ay+by)/2-height/2,width,height,
    angle:Math.atan2(by-ay,bx-ax)+(echoIndex? (echoIndex-2)*.12:0)};
}
