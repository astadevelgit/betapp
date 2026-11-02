export type CatalogMatchStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled"
  | "suspended";

export type CatalogMarketType = "1X2" | "OU25" | "BTTS" | "DC";

export type CatalogMarketStatus = "open" | "suspended" | "settled" | "void";

export type CatalogSelectionName =
  | "home"
  | "draw"
  | "away"
  | "over"
  | "under"
  | "yes"
  | "no"
  | "1X"
  | "X2"
  | "12";

export interface CatalogSelection {
  id: string;
  name: CatalogSelectionName;
  odds: number;
  active: boolean;
}

export interface CatalogMarket {
  id: string;
  type: CatalogMarketType;
  status: CatalogMarketStatus;
  line: number | null;
  updatedAt: string;
  selections: CatalogSelection[];
}

export interface CatalogMatch {
  id: string;
  externalId: string;
  kickoffAt: string;
  status: CatalogMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  source: string;
  isDemo: boolean;
  competition: {
    name: string;
    country: string | null;
    logoUrl: string | null;
  };
  homeTeam: {
    name: string;
    logoUrl: string | null;
  };
  awayTeam: {
    name: string;
    logoUrl: string | null;
  };
  markets: CatalogMarket[];
}

export interface MatchLiveSnapshot {
  id: string;
  status: CatalogMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  lastSyncedAt: string | null;
}
