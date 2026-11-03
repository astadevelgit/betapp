export type ProviderFixtureStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled"
  | "suspended";

export type ProviderMarketType = "1X2" | "OU25" | "BTTS" | "DC";

export type ProviderSelectionName =
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

export interface ProviderTeam {
  externalId: string;
  name: string;
  logoUrl: string | null;
}

export interface ProviderCompetition {
  externalId: string;
  name: string;
  country: string | null;
  logoUrl: string | null;
  season: number | null;
}

export interface ProviderFixture {
  externalId: string;
  competition: ProviderCompetition;
  homeTeam: ProviderTeam;
  awayTeam: ProviderTeam;
  kickoffAt: string;
  status: ProviderFixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  round: string | null;
  venue: string | null;
  rawStatus: string;
}

export interface ProviderSelection {
  name: ProviderSelectionName;
  odds: number;
  providerValue: string;
}

export interface ProviderMarket {
  type: ProviderMarketType;
  line: number | null;
  providerMarketId: string;
  selections: ProviderSelection[];
}

export interface ProviderOdds {
  fixtureExternalId: string;
  bookmaker: string | null;
  markets: ProviderMarket[];
  updatedAt: string | null;
}

export interface OddsProvider {
  readonly name: string;
  /**
   * Market types this provider can supply from its normal sync path. Defaults
   * to all four when omitted, so existing full-coverage providers are
   * unaffected. Partial providers such as The Odds API declare their subset so
   * odds sync does not keep treating missing markets as stale.
   */
  readonly supportedMarketTypes?: readonly ProviderMarketType[];
  getCompetitions(): Promise<ProviderCompetition[]>;
  getFixtures(params: {
    from: string;
    to: string;
    leagueIds?: number[];
  }): Promise<ProviderFixture[]>;
  getLiveFixtures(): Promise<ProviderFixture[]>;
  getOdds(fixtureId: string): Promise<ProviderOdds | null>;
  getResults(params: { date: string }): Promise<ProviderFixture[]>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(
    message = "Football data provider is not configured. Add SPORTMONKS_API_TOKEN, API_FOOTBALL_KEY, or THE_ODDS_API_KEY to .env.local.",
  ) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderError extends Error {
  readonly status: number | null;
  readonly details: unknown;

  constructor(message: string, status: number | null = null, details?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.details = details;
  }
}
