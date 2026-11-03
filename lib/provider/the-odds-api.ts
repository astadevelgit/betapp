import "server-only";

import {
  ProviderError,
  type OddsProvider,
  type ProviderCompetition,
  type ProviderFixture,
  type ProviderMarket,
  type ProviderMarketType,
  type ProviderOdds,
  type ProviderSelection,
  type ProviderSelectionName,
} from "./types";

const DEFAULT_BASE_URL = "https://api.the-odds-api.com/v4";
const DEFAULT_SPORT_KEYS = ["soccer_epl"];
const DEFAULT_REGIONS = "eu";
const DEFAULT_MARKETS = "h2h,totals";
const REQUEST_TIMEOUT_MS = 20_000;
const ODDS_CACHE_MS = 5 * 60 * 1000;
const SCORES_CACHE_MS = 2 * 60 * 1000;
const SUPPORTED_MARKETS = new Set(["h2h", "totals"]);

interface TheOddsApiSport {
  key: string;
  group: string;
  title: string;
  description?: string | null;
  active: boolean;
  has_outrights?: boolean;
}

interface TheOddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

interface TheOddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

interface TheOddsApiMarket {
  key: string;
  last_update?: string | null;
  outcomes: TheOddsApiOutcome[];
}

interface TheOddsApiBookmaker {
  key: string;
  title: string;
  last_update?: string | null;
  markets: TheOddsApiMarket[];
}

interface TheOddsApiOddsEvent extends TheOddsApiEvent {
  bookmakers: TheOddsApiBookmaker[];
}

interface TheOddsApiScore {
  name: string;
  score: string;
}

interface TheOddsApiScoreEvent extends TheOddsApiEvent {
  completed: boolean;
  scores: TheOddsApiScore[] | null;
  last_update?: string | null;
}

interface CachedOdds {
  at: number;
  events: TheOddsApiOddsEvent[];
}

interface CachedScores {
  at: number;
  events: TheOddsApiScoreEvent[];
}

export class TheOddsApiProvider implements OddsProvider {
  readonly name = "the-odds-api";
  readonly supportedMarketTypes = ["1X2", "OU25"] as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly sportKeys: string[];
  private readonly regions: string;
  private readonly markets: string;

  private oddsCache: CachedOdds | null = null;
  private readonly scoresCache = new Map<string, CachedScores>();
  private readonly scoresInflight = new Map<
    string,
    Promise<TheOddsApiScoreEvent[]>
  >();

  constructor(options?: {
    apiKey?: string;
    baseUrl?: string;
    sportKeys?: string[];
    regions?: string;
    markets?: string;
  }) {
    this.apiKey = (options?.apiKey ?? process.env.THE_ODDS_API_KEY ?? "").trim();
    this.baseUrl = (
      options?.baseUrl ??
      process.env.THE_ODDS_API_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/$/, "");
    this.sportKeys = options?.sportKeys ?? readSportKeys();
    this.regions =
      options?.regions ?? process.env.THE_ODDS_API_REGIONS ?? DEFAULT_REGIONS;
    this.markets = readMarkets(
      options?.markets ?? process.env.THE_ODDS_API_MARKETS ?? DEFAULT_MARKETS,
    );
  }

  async getCompetitions(): Promise<ProviderCompetition[]> {
    const sports = await this.request<TheOddsApiSport>("/sports", {
      all: "true",
    });
    const selected = new Set(this.sportKeys);

    return dedupeBy(
      sports
        .filter(
          (sport) =>
            sport.active &&
            sport.group.trim().toLowerCase() === "soccer" &&
            (selected.size === 0 || selected.has(sport.key)),
        )
        .map((sport) => ({
          externalId: sport.key,
          name: sport.title,
          country: null,
          logoUrl: null,
          season: null,
        })),
      (competition) => competition.externalId,
    );
  }

  async getFixtures(params: {
    from: string;
    to: string;
    leagueIds?: number[];
  }): Promise<ProviderFixture[]> {
    const from = startOfUtcDay(params.from);
    const to = endOfUtcDay(params.to);
    const now = Date.now();
    const fixtures: ProviderFixture[] = [];

    for (const sportKey of this.sportKeys) {
      const events = await this.request<TheOddsApiEvent>(
        `/sports/${encodeURIComponent(sportKey)}/events`,
        {
          commenceTimeFrom: new Date(from).toISOString(),
          commenceTimeTo: new Date(to).toISOString(),
          dateFormat: "iso",
        },
      );

      for (const event of events) {
        const commenceTime = new Date(event.commence_time).getTime();
        if (!Number.isFinite(commenceTime)) {
          continue;
        }

        // The events endpoint also returns in-play games. Fixtures sync only
        // owns the scheduled catalog, so live games are left to syncLive.
        if (commenceTime < now) {
          continue;
        }

        fixtures.push(mapEventToFixture(event));
      }
    }

    return dedupeBy(fixtures, (fixture) => fixture.externalId);
  }

  async getLiveFixtures(): Promise<ProviderFixture[]> {
    const now = Date.now();
    const fixtures: ProviderFixture[] = [];

    for (const sportKey of this.sportKeys) {
      const events = await this.fetchScores(sportKey);

      for (const event of events) {
        if (event.completed) {
          continue;
        }

        const commenceTime = new Date(event.commence_time).getTime();
        if (!Number.isFinite(commenceTime) || commenceTime > now) {
          continue;
        }

        const fixture = mapScoreEvent(event, "live");
        if (fixture) {
          fixtures.push(fixture);
        }
      }
    }

    return dedupeBy(fixtures, (fixture) => fixture.externalId);
  }

  async getOdds(fixtureId: string): Promise<ProviderOdds | null> {
    const events = await this.fetchOdds();
    const event = events.find((entry) => entry.id === fixtureId);
    return event ? mapEventOdds(event) : null;
  }

  async getResults(params: { date: string }): Promise<ProviderFixture[]> {
    const target = startOfUtcDay(params.date);
    const fixtures: ProviderFixture[] = [];

    for (const sportKey of this.sportKeys) {
      const events = await this.fetchScores(sportKey);

      for (const event of events) {
        if (!event.completed) {
          continue;
        }

        const commenceTime = new Date(event.commence_time).getTime();
        if (!Number.isFinite(commenceTime)) {
          continue;
        }

        if (startOfUtcDay(event.commence_time) !== target) {
          continue;
        }

        const fixture = mapScoreEvent(event, "finished");
        if (fixture) {
          fixtures.push(fixture);
        }
      }
    }

    return dedupeBy(fixtures, (fixture) => fixture.externalId);
  }

  private async fetchOdds(): Promise<TheOddsApiOddsEvent[]> {
    if (this.oddsCache && Date.now() - this.oddsCache.at < ODDS_CACHE_MS) {
      return this.oddsCache.events;
    }

    const events: TheOddsApiOddsEvent[] = [];

    for (const sportKey of this.sportKeys) {
      const response = await this.request<TheOddsApiOddsEvent>(
        `/sports/${encodeURIComponent(sportKey)}/odds`,
        {
          regions: this.regions,
          markets: this.markets,
          oddsFormat: "decimal",
          dateFormat: "iso",
        },
      );
      events.push(...response);
    }

    this.oddsCache = { at: Date.now(), events };
    return events;
  }

  private async fetchScores(sportKey: string): Promise<TheOddsApiScoreEvent[]> {
    const cached = this.scoresCache.get(sportKey);
    if (cached && Date.now() - cached.at < SCORES_CACHE_MS) {
      return cached.events;
    }

    // syncLive calls getLiveFixtures and getResults concurrently. Share the
    // in-flight request so the paid /scores call happens only once.
    const inflight = this.scoresInflight.get(sportKey);
    if (inflight) {
      return inflight;
    }

    // `daysFrom=1` costs 2 credits but returns live, upcoming and recently
    // completed games in one call. Sharing it between live and result syncs
    // avoids a second request.
    const request = this.request<TheOddsApiScoreEvent>(
      `/sports/${encodeURIComponent(sportKey)}/scores`,
      {
        daysFrom: "1",
        dateFormat: "iso",
      },
    )
      .then((events) => {
        this.scoresCache.set(sportKey, { at: Date.now(), events });
        return events;
      })
      .finally(() => {
        this.scoresInflight.delete(sportKey);
      });

    this.scoresInflight.set(sportKey, request);
    return request;
  }

  private async request<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    if (!this.apiKey) {
      throw new ProviderError("The Odds API key is missing.", 401);
    }

    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("apiKey", this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    let lastError: ProviderError | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;

      try {
        response = await fetch(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (error) {
        lastError = new ProviderError(
          `The Odds API request failed: ${path}`,
          null,
          error,
        );
        await sleep(500 * (attempt + 1));
        continue;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 2);
        lastError = new ProviderError("The Odds API rate limit reached.", 429);
        await sleep(Math.max(1, retryAfter) * 1000);
        continue;
      }

      if (!response.ok) {
        throw new ProviderError(
          `The Odds API returned HTTP ${response.status}.`,
          response.status,
          await safeText(response),
        );
      }

      const payload = (await response.json()) as unknown;

      if (Array.isArray(payload)) {
        return payload as T[];
      }

      const message =
        payload &&
        typeof payload === "object" &&
        "message" in payload
          ? String((payload as { message?: unknown }).message)
          : null;

      throw new ProviderError(
        "The Odds API returned an error payload.",
        response.status,
        message,
      );
    }

    throw lastError ?? new ProviderError("The Odds API request failed.");
  }
}

function mapEventToFixture(event: TheOddsApiEvent): ProviderFixture {
  return {
    externalId: event.id,
    competition: {
      externalId: event.sport_key,
      name: event.sport_title,
      country: null,
      logoUrl: null,
      season: null,
    },
    homeTeam: {
      externalId: event.home_team,
      name: event.home_team,
      logoUrl: null,
    },
    awayTeam: {
      externalId: event.away_team,
      name: event.away_team,
      logoUrl: null,
    },
    kickoffAt: event.commence_time,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    minute: null,
    round: null,
    venue: null,
    rawStatus: "scheduled",
  };
}

function mapScoreEvent(
  event: TheOddsApiScoreEvent,
  status: "live" | "finished",
): ProviderFixture | null {
  const score = mapScore(event.scores, event.home_team, event.away_team);

  // Without both scores we cannot show a live score or settle a bet. Leave the
  // existing catalog row untouched until the provider has a complete result.
  if (score.home === null || score.away === null) {
    return null;
  }

  return {
    externalId: event.id,
    competition: {
      externalId: event.sport_key,
      name: event.sport_title,
      country: null,
      logoUrl: null,
      season: null,
    },
    homeTeam: {
      externalId: event.home_team,
      name: event.home_team,
      logoUrl: null,
    },
    awayTeam: {
      externalId: event.away_team,
      name: event.away_team,
      logoUrl: null,
    },
    kickoffAt: event.commence_time,
    status,
    homeScore: score.home,
    awayScore: score.away,
    minute: null,
    round: null,
    venue: null,
    rawStatus: event.completed ? "completed" : "live",
  };
}

function mapScore(
  scores: TheOddsApiScore[] | null,
  homeTeam: string,
  awayTeam: string,
): { home: number | null; away: number | null } {
  if (!scores) {
    return { home: null, away: null };
  }

  const home = readTeamScore(scores, homeTeam);
  const away = readTeamScore(scores, awayTeam);
  return { home, away };
}

function readTeamScore(
  scores: TheOddsApiScore[],
  team: string,
): number | null {
  const key = normalizeTeam(team);
  const entry = scores.find((score) => normalizeTeam(score.name) === key);
  if (!entry) {
    return null;
  }

  const parsed = Number(entry.score);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function mapEventOdds(event: TheOddsApiOddsEvent): ProviderOdds | null {
  const candidates: Array<{
    bookmaker: TheOddsApiBookmaker;
    markets: ProviderMarket[];
    updatedAt: string | null;
  }> = [];

  for (const bookmaker of event.bookmakers) {
    const markets = mapBookmakerMarkets(bookmaker.markets, event);
    if (markets.length === 0) {
      continue;
    }

    candidates.push({
      bookmaker,
      markets,
      updatedAt: latestMarketUpdate(bookmaker.markets),
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (b.markets.length !== a.markets.length) {
      return b.markets.length - a.markets.length;
    }

    const aUpdated = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bUpdated = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bUpdated - aUpdated;
  });

  const best = candidates[0];

  return {
    fixtureExternalId: event.id,
    bookmaker: best.bookmaker.title,
    markets: best.markets,
    updatedAt: best.updatedAt,
  };
}

function mapBookmakerMarkets(
  markets: TheOddsApiMarket[],
  event: TheOddsApiOddsEvent,
): ProviderMarket[] {
  const providerMarkets: ProviderMarket[] = [];

  for (const market of markets) {
    if (!SUPPORTED_MARKETS.has(market.key)) {
      continue;
    }

    const type: ProviderMarketType = market.key === "h2h" ? "1X2" : "OU25";
    const selections = mapOutcomes(type, market.outcomes, event);

    if (type === "1X2" && selections.length < 3) {
      continue;
    }

    if (type === "OU25" && selections.length < 2) {
      continue;
    }

    providerMarkets.push({
      type,
      line: type === "OU25" ? 2.5 : null,
      providerMarketId: `${market.key}:${market.last_update ?? event.id}`,
      selections,
    });
  }

  return providerMarkets;
}

function mapOutcomes(
  type: ProviderMarketType,
  outcomes: TheOddsApiOutcome[],
  event: TheOddsApiOddsEvent,
): ProviderSelection[] {
  const seen = new Set<ProviderSelectionName>();
  const selections: ProviderSelection[] = [];

  for (const outcome of outcomes) {
    const name = mapSelectionName(type, outcome, event);
    if (!name || seen.has(name)) {
      continue;
    }

    if (
      type === "OU25" &&
      (typeof outcome.point !== "number" || Math.abs(outcome.point - 2.5) > 0.001)
    ) {
      continue;
    }

    const odds = Number(outcome.price);
    if (!Number.isFinite(odds) || odds <= 1 || odds >= 1000) {
      continue;
    }

    seen.add(name);
    selections.push({
      name,
      odds: Math.round(odds * 1000) / 1000,
      providerValue: outcome.name,
    });
  }

  return selections;
}

function mapSelectionName(
  type: ProviderMarketType,
  outcome: TheOddsApiOutcome,
  event: TheOddsApiOddsEvent,
): ProviderSelectionName | null {
  const key = normalizeSelection(outcome.name);

  if (type === "1X2") {
    if (key === normalizeSelection(event.home_team)) return "home";
    if (key === "draw" || key === "tie" || key === "x") return "draw";
    if (key === normalizeSelection(event.away_team)) return "away";
    if (key === "1" || key === "home") return "home";
    if (key === "2" || key === "away") return "away";
    return null;
  }

  if (type === "OU25") {
    if (key === "over") return "over";
    if (key === "under") return "under";
    return null;
  }

  return null;
}

function latestMarketUpdate(
  markets: TheOddsApiMarket[],
): string | null {
  let latest: string | null = null;
  let latestTime = 0;

  for (const market of markets) {
    if (!market.last_update) {
      continue;
    }

    const time = new Date(market.last_update).getTime();
    if (!Number.isFinite(time)) {
      continue;
    }

    if (time > latestTime) {
      latestTime = time;
      latest = new Date(time).toISOString();
    }
  }

  return latest;
}

function readSportKeys(): string[] {
  const raw = process.env.THE_ODDS_API_SPORT_KEYS;
  if (!raw) {
    return DEFAULT_SPORT_KEYS;
  }

  const keys = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return keys.length > 0 ? keys : DEFAULT_SPORT_KEYS;
}

function readMarkets(raw: string): string {
  const markets = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => SUPPORTED_MARKETS.has(value));

  return markets.length > 0 ? markets.join(",") : DEFAULT_MARKETS;
}

function startOfUtcDay(value: string): string {
  if (value.includes("T")) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? new Date().toISOString().slice(0, 10)
      : date.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

function endOfUtcDay(value: string): string {
  return `${startOfUtcDay(value)}T23:59:59.999Z`;
}

function normalizeSelection(value: string): string {
  return value.trim().toLowerCase().replace(/[\s/_-]+/g, "");
}

function normalizeTeam(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(key(item), item);
  }
  return [...map.values()];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}
