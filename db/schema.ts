import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gameSaves = sqliteTable("game_saves", {
  playerId: text("player_id").primaryKey(),
  accountId: text("account_id"),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const saveSnapshots = sqliteTable(
  "save_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playerId: text("player_id").notNull(),
    accountId: text("account_id").notNull(),
    payload: text("payload").notNull(),
    kind: text("kind").notNull().default("automatic"),
    capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_save_snapshots_account_captured").on(table.accountId, table.capturedAt),
    index("idx_save_snapshots_player_captured").on(table.playerId, table.capturedAt),
  ],
);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isGm: integer("is_gm", { mode: "boolean" }).notNull().default(false),
  suspendedAt: text("suspended_at"),
  suspendedUntil: text("suspended_until"),
  suspensionReason: text("suspension_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Historical rebirth rewards remain bound to the stable account ID after a
// character reset. They are never inferred from the new character nickname.
export const accountRebirthEntitlements = sqliteTable("account_rebirth_entitlements", {
  accountId: text("account_id").primaryKey(),
  legacyRebirthCount: integer("legacy_rebirth_count").notNull(),
  tier: integer("tier").notNull(),
  resetVersion: text("reset_version").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull(),
  // The cookie identifies the authenticated account, while loginId identifies
  // the exact login window that currently owns the account. Browsers share
  // cookies between tabs, so the cookie alone cannot tell an old tab from the
  // newest explicit login.
  loginId: text("login_id").notNull().default(""),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const deathEvents = sqliteTable(
  "death_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    playerId: text("player_id").notNull(),
    accountId: text("account_id").notNull(),
    mapId: integer("map_id").notNull(),
    floor: integer("floor").notNull(),
    playerClass: text("player_class").notNull(),
    playerLevel: integer("player_level").notNull(),
    combatPower: integer("combat_power").notNull(),
    occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_death_events_occurred_at").on(table.occurredAt),
    index("idx_death_events_map_floor").on(table.mapId, table.floor),
  ],
);

export const gmActionLogs = sqliteTable(
  "gm_action_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gmAccountId: text("gm_account_id").notNull(),
    targetAccountId: text("target_account_id"),
    action: text("action").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_gm_action_logs_created_at").on(table.createdAt),
    index("idx_gm_action_logs_target_account_id").on(table.targetAccountId),
  ],
);

export const globalResetRuns = sqliteTable("global_reset_runs", {
  id: text("id").primaryKey(),
  gmAccountId: text("gm_account_id").notNull(),
  accountCount: integer("account_count").notNull(),
  saveCount: integer("save_count").notNull(),
  archiveCount: integer("archive_count").notNull(),
  entitlementCount: integer("entitlement_count").notNull(),
  completedAt: text("completed_at").notNull(),
});

// Shared across Workers; no process-local counters or stored plain IP addresses.
export const authRateLimits=sqliteTable("auth_rate_limits",{
 key:text("key").primaryKey(),
 windowStart:integer("window_start").notNull(),
 windowEnd:integer("window_end").notNull(),
 count:integer("count").notNull(),
},table=>[index("idx_auth_rate_limits_window_end").on(table.windowEnd)]);

export const worldBossDamageEvents = sqliteTable('world_boss_damage_events', {
 id: text('id').primaryKey(), cycle: text('cycle').notNull(), accountId: text('account_id').notNull(),
 damage: integer('damage').notNull(), snapshot: text('snapshot').notNull(), recordedAt: text('recorded_at').notNull(),
}, t=>[index('idx_world_boss_events_cycle').on(t.cycle,t.accountId)]);
export const worldBossSettlements = sqliteTable('world_boss_settlements', {
 cycle: text('cycle').primaryKey(), operationId: text('operation_id').notNull(),
 winners: text('winners').notNull(), completedAt: text('completed_at').notNull(),
});
export const worldBossRewardMails = sqliteTable('world_boss_reward_mails', {
 id: text('id').primaryKey(), cycle: text('cycle').notNull(), accountId: text('account_id').notNull(),
 rank: integer('rank').notNull(), mail: text('mail').notNull(), createdAt: text('created_at').notNull(),
 expiresAt: text('expires_at').notNull(), deliveredAt: text('delivered_at'),
}, t=>[index('idx_world_boss_mail_account').on(t.accountId,t.deliveredAt)]);
export const worldBossRewardClaims = sqliteTable('world_boss_reward_claims', {
 mailId:text('mail_id').primaryKey(),accountId:text('account_id').notNull(),claimedAt:text('claimed_at').notNull(),
}, t=>[index('idx_world_boss_claim_account').on(t.accountId)]);
