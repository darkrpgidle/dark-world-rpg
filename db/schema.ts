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
