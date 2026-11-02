import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Drizzle mirror of supabase/migrations/20261101000001_foundation.sql.
 *
 * The SQL migration is the source of truth for Supabase. Keep this file in sync
 * when the schema changes. The auth.users foreign key lives in SQL because the
 * auth schema is managed by Supabase.
 */

export const profileRoleEnum = pgEnum("profile_role", ["user", "admin"]);
export const profileStatusEnum = pgEnum("profile_status", [
  "active",
  "suspended",
  "deleted",
]);
export const walletTxTypeEnum = pgEnum("wallet_tx_type", [
  "signup_bonus",
  "daily_claim",
  "bet_stake",
  "bet_payout",
  "bet_refund",
  "admin_adjustment",
  "correction",
]);

export const matchStatusEnum = pgEnum("match_status", [
  "scheduled",
  "live",
  "halftime",
  "finished",
  "postponed",
  "cancelled",
  "suspended",
]);

export const marketTypeEnum = pgEnum("market_type", [
  "1X2",
  "OU25",
  "BTTS",
  "DC",
]);

export const marketStatusEnum = pgEnum("market_status", [
  "open",
  "suspended",
  "settled",
  "void",
]);

export const selectionNameEnum = pgEnum("selection_name", [
  "home",
  "draw",
  "away",
  "over",
  "under",
  "yes",
  "no",
  "1X",
  "X2",
  "12",
]);

export const betTypeEnum = pgEnum("bet_type", ["single", "accumulator"]);

export const betStatusEnum = pgEnum("bet_status", [
  "open",
  "won",
  "lost",
  "void",
]);

export const legResultEnum = pgEnum("leg_result", [
  "pending",
  "won",
  "lost",
  "void",
]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    dob: date("dob", { mode: "string" }).notNull(),
    country: text("country").notNull().default("NG"),
    role: profileRoleEnum("role").notNull().default("user"),
    status: profileStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("profiles_status_idx").on(table.status),
    index("profiles_created_at_idx").on(table.createdAt),
  ],
);

export const wallets = pgTable("wallets", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  currency: text("currency").notNull().default("BET"),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: walletTxTypeEnum("type").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    balanceBefore: bigint("balance_before", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    reference: text("reference").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wallet_transactions_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    index("wallet_transactions_reference_idx").on(table.reference),
  ],
);

export const dailyClaims = pgTable(
  "daily_claims",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    claimDate: date("claim_date", { mode: "string" }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    walletTransactionId: uuid("wallet_transaction_id").references(
      () => walletTransactions.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.claimDate] })],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  description: text("description"),
  updatedBy: uuid("updated_by").references(() => profiles.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    status: text("status").notNull().default("waiting"),
    source: text("source").notNull().default("signup"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("waitlist_created_at_idx").on(table.createdAt.desc())],
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("admin_audit_logs_admin_created_idx").on(
      table.adminId,
      table.createdAt.desc(),
    ),
    index("admin_audit_logs_entity_idx").on(table.entity, table.entityId),
  ],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    recordsProcessed: integer("records_processed").notNull().default(0),
    error: text("error"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("sync_runs_job_started_idx").on(table.job, table.startedAt.desc()),
    index("sync_runs_status_idx").on(table.status),
  ],
);

export const sports = pgTable("sports", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const competitions = pgTable(
  "competitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull().unique(),
    source: text("source").notNull().default("sportmonks"),
    name: text("name").notNull(),
    country: text("country"),
    logoUrl: text("logo_url"),
    season: integer("season"),
    priority: integer("priority").notNull().default(100),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("competitions_sport_priority_idx").on(
      table.sportId,
      table.priority,
      table.name,
    ),
  ],
);

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull().unique(),
  source: text("source").notNull().default("sportmonks"),
  name: text("name").notNull(),
  country: text("country"),
  logoUrl: text("logo_url"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id").notNull().unique(),
    source: text("source").notNull().default("sportmonks"),
    sportId: uuid("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "restrict" }),
    homeTeamId: uuid("home_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    awayTeamId: uuid("away_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true, mode: "date" })
      .notNull(),
    status: matchStatusEnum("status").notNull().default("scheduled"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    minute: integer("minute"),
    round: text("round"),
    venue: text("venue"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("matches_status_kickoff_idx").on(table.status, table.kickoffAt),
    index("matches_kickoff_idx").on(table.kickoffAt),
    index("matches_competition_kickoff_idx").on(
      table.competitionId,
      table.kickoffAt,
    ),
  ],
);

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    type: marketTypeEnum("type").notNull(),
    status: marketStatusEnum("status").notNull().default("open"),
    line: numeric("line", { precision: 4, scale: 2 }),
    providerMarketId: text("provider_market_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("markets_match_idx").on(table.matchId),
    unique("markets_match_type_key").on(table.matchId, table.type),
  ],
);

export const selections = pgTable(
  "selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    name: selectionNameEnum("name").notNull(),
    odds: numeric("odds", { precision: 6, scale: 3 }).notNull(),
    active: boolean("active").notNull().default(true),
    providerSelectionId: text("provider_selection_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("selections_market_idx").on(table.marketId),
    unique("selections_market_name_key").on(table.marketId, table.name),
  ],
);

export const bets = pgTable(
  "bets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    type: betTypeEnum("type").notNull(),
    stake: bigint("stake", { mode: "number" }).notNull(),
    totalOdds: numeric("total_odds").notNull(),
    potentialPayout: bigint("potential_payout", { mode: "number" }).notNull(),
    payout: bigint("payout", { mode: "number" }).notNull().default(0),
    status: betStatusEnum("status").notNull().default("open"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    placedAt: timestamp("placed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true, mode: "date" }),
    settledBy: uuid("settled_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    settlementReason: text("settlement_reason"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("bets_user_placed_idx").on(table.userId, table.placedAt.desc()),
    index("bets_user_status_placed_idx").on(
      table.userId,
      table.status,
      table.placedAt.desc(),
    ),
    index("bets_status_placed_idx").on(table.status, table.placedAt.desc()),
    check("bets_stake_range", sql`${table.stake} between 100 and 50000`),
    check("bets_total_odds_positive", sql`${table.totalOdds} > 1`),
    check(
      "bets_potential_payout_range",
      sql`${table.potentialPayout} > 0 and ${table.potentialPayout} <= 1000000`,
    ),
    check("bets_payout_non_negative", sql`${table.payout} >= 0`),
    check(
      "bets_settlement_consistent",
      sql`(${table.status} = 'open' and ${table.settledAt} is null) or (${table.status} <> 'open' and ${table.settledAt} is not null)`,
    ),
  ],
);

export const betLegs = pgTable(
  "bet_legs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    betId: uuid("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "restrict" }),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "restrict" }),
    selectionId: uuid("selection_id")
      .notNull()
      .references(() => selections.id, { onDelete: "restrict" }),
    oddsAtPlacement: numeric("odds_at_placement", {
      precision: 6,
      scale: 3,
    }).notNull(),
    result: legResultEnum("result").notNull().default("pending"),
    settledAt: timestamp("settled_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bet_legs_bet_idx").on(table.betId),
    index("bet_legs_match_result_idx").on(table.matchId, table.result),
    index("bet_legs_selection_idx").on(table.selectionId),
    unique("bet_legs_one_per_match").on(table.betId, table.matchId),
    unique("bet_legs_one_per_market").on(table.betId, table.marketId),
    check(
      "bet_legs_odds_range",
      sql`${table.oddsAtPlacement} > 1.000 and ${table.oddsAtPlacement} < 1000.000`,
    ),
    check(
      "bet_legs_settlement_consistent",
      sql`(${table.result} = 'pending' and ${table.settledAt} is null) or (${table.result} <> 'pending' and ${table.settledAt} is not null)`,
    ),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type DailyClaim = typeof dailyClaims.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type WaitlistEntry = typeof waitlist.$inferSelect;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type Sport = typeof sports.$inferSelect;
export type Competition = typeof competitions.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Market = typeof markets.$inferSelect;
export type Selection = typeof selections.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type NewBet = typeof bets.$inferInsert;
export type BetLeg = typeof betLegs.$inferSelect;
export type NewBetLeg = typeof betLegs.$inferInsert;
