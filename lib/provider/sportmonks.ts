import "server-only";

import {
  ProviderError,
  type OddsProvider,
  type ProviderCompetition,
  type ProviderFixture,
  type ProviderFixtureStatus,
  type ProviderMarket,
  type ProviderMarketType,
  type ProviderOdds,
  type ProviderSelection,
  type ProviderSelectionName,
} from "./types";

interface SportmonksEnvelope<T> {
  data?: T[] | T | null;
  message?: string;
  pagination?: {
    count?: number;
    per_page?: number;
    has_more?: boolean;
    current_page?: number;
    next_page?: string | null;
  } | null;
  rate_limit?: {
    remaining?: number;
    resets_in_seconds?: number;
  } | null;
}

interface SportmonksLeague {
  id: number;
  name: string;
  image_path?: string | null;
  country?: { name?: string | null } | null;
  currentseason?: {
    id?: number;
    name?: string | null;
    starting_at?: string | null;
  } | null;
}

interface SportmonksParticipant {
  id: number;
  name: string;
  image_path?: string | null;
  meta?: {
    location?: string | null;
  } | null;
}

interface SportmonksScore {
  description?: string | null;
  score?: {
    goals?: number | null;
    participant?: string | null;
  } | null;
}

interface SportmonksPeriod {
  minutes?: number | null;
  ticking?: boolean | null;
  sort_order?: number | null;
  description?: string | null;
}

interface SportmonksFixture {
  id: number;
  league_id: number;
  season_id?: number | null;
  state_id: number;
  name?: string | null;
  starting_at?: string | null;
  starting_at_timestamp?: number | null;
  placeholder?: boolean | null;
  league?: {
    id?: number;
    name?: string | null;
    image_path?: string | null;
    country?: { name?: string | null } | null;
  } | null;
  season?: { name?: string | null } | null;
  state?: {
    state?: string | null;
    name?: string | null;
    short_name?: string | null;
  } | null;
  venue?: {
    name?: string | null;
    city?: string | null;
  } | null;
  round?: { name?: string | null } | null;
  participants?: SportmonksParticipant[] | null;
  scores?: SportmonksScore[] | null;
  periods?: SportmonksPeriod[] | null;
}

interface SportmonksOdd {
  fixture_id: number;
  market_id: number;
  bookmaker_id: number;
  label?: string | null;
  name?: string | null;
  value?: string | null;
  dp3?: string | null;
  total?: string | number | null;
  stopped?: boolean | null;
  created_at?: string | null;
  latest_bookmaker_update?: string | null;
  bookmaker?: {
    id?: number;
    name?: string | null;
  } | null;
}

const DEFAULT_BASE_URL = "https://api.sportmonks.com/v3/football";
const DEFAULT_LEAGUE_IDS = [271, 501];
const FIXTURE_INCLUDES =
  "participants;league.country;state;venue;scores;periods;round;season";
const TARGET_MARKET_IDS = [1, 2, 14, 80] as const;
const MARKET_ID_TO_TYPE: Record<number, ProviderMarketType> = {
  1: "1X2",
  2: "DC",
  14: "BTTS",
  80: "OU25",
};
const MARKET_TYPE_TO_ID: Record<ProviderMarketType, number> = {
  "1X2": 1,
  DC: 2,
  BTTS: 14,
  OU25: 80,
};
const REQUIRED_SELECTIONS: Record<ProviderMarketType, number> = {
  "1X2": 3,
  OU25: 2,
  BTTS: 2,
  DC: 3,
};
const REQUEST_TIMEOUT_MS = 20_000;
const PER_PAGE = 50;
const MAX_PAGES = 10;

export class SportmonksProvider implements OddsProvider {
  readonly name = "sportmonks";

  private readonly token: string;
  private readonly baseUrl: string;
  private readonly leagueIds: number[];

  constructor(options?: {
    token?: string;
    baseUrl?: string;
    leagueIds?: number[];
  }) {
    this.token = (options?.token ?? process.env.SPORTMONKS_API_TOKEN ?? "").trim();
    this.baseUrl = (
      options?.baseUrl ??
      process.env.SPORTMONKS_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/$/, "");
    this.leagueIds = options?.leagueIds ?? readLeagueIds();
  }

  async getCompetitions(): Promise<ProviderCompetition[]> {
    const response = await this.request<SportmonksLeague>("/leagues", {
      include: "country;currentSeason",
    });
    const selected = new Set(this.leagueIds);

    return dedupeBy(
      response
        .filter((league) => selected.size === 0 || selected.has(league.id))
        .map((league) => ({
          externalId: String(league.id),
          name: league.name,
          country: league.country?.name ?? null,
          logoUrl: league.image_path ?? null,
          season:
            parseSeasonStart(league.currentseason?.name) ??
            parseSeasonStart(league.currentseason?.starting_at),
        })),
      (competition) => competition.externalId,
    );
  }

  async getFixtures(params: {
    from: string;
    to: string;
    leagueIds?: number[];
  }): Promise<ProviderFixture[]> {
    const leagueIds = params.leagueIds ?? this.leagueIds;
    const response = await this.request<SportmonksFixture>(
      `/fixtures/between/${params.from}/${params.to}`,
      this.fixtureQuery(leagueIds, { order: "asc" }),
    );

    return this.mapFixtures(response, leagueIds);
  }

  async getLiveFixtures(): Promise<ProviderFixture[]> {
    const payload = await this.requestPage<SportmonksFixture>(
      "/livescores/inplay",
      this.fixtureQuery(this.leagueIds),
    );

    return this.mapFixtures(normalizeData(payload.data), this.leagueIds);
  }

  async getOdds(fixtureId: string): Promise<ProviderOdds | null> {
    const response = await this.request<SportmonksOdd>(
      `/odds/pre-match/fixtures/${fixtureId}`,
      {
        filters: `markets:${TARGET_MARKET_IDS.join(",")}`,
        include: "bookmaker",
      },
    );

    return mapSportmonksOdds(fixtureId, response);
  }

  async getResults(params: { date: string }): Promise<ProviderFixture[]> {
    const response = await this.request<SportmonksFixture>(
      `/fixtures/date/${params.date}`,
      this.fixtureQuery(this.leagueIds, { order: "asc" }),
    );

    return this.mapFixtures(response, this.leagueIds);
  }

  private fixtureQuery(
    leagueIds: number[],
    extra?: Record<string, string>,
  ): Record<string, string> {
    const query: Record<string, string> = {
      include: FIXTURE_INCLUDES,
      ...extra,
    };

    if (leagueIds.length > 0) {
      query.filters = `fixtureLeagues:${leagueIds.join(",")}`;
    }

    return query;
  }

  private mapFixtures(
    fixtures: SportmonksFixture[],
    leagueIds: number[],
  ): ProviderFixture[] {
    const selected = new Set(leagueIds);

    return dedupeBy(
      fixtures
        .filter((fixture) => selected.size === 0 || selected.has(fixture.league_id))
        .map(mapSportmonksFixture)
        .filter((fixture): fixture is ProviderFixture => fixture !== null),
      (fixture) => fixture.externalId,
    );
  }

  private async request<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const results: T[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const payload = await this.requestPage<T>(path, {
        ...params,
        per_page: String(PER_PAGE),
        page: String(page),
      });

      results.push(...normalizeData(payload.data));

      if (!payload.pagination?.has_more) {
        break;
      }
    }

    return results;
  }

  private async requestPage<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<SportmonksEnvelope<T>> {
    if (!this.token) {
      throw new ProviderError("Sportmonks API token is missing.", 401);
    }

    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("api_token", this.token);
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
          `Sportmonks request failed: ${path}`,
          null,
          error,
        );
        await sleep(500 * (attempt + 1));
        continue;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 2);
        lastError = new ProviderError("Sportmonks rate limit reached.", 429);
        await sleep(Math.max(1, retryAfter) * 1000);
        continue;
      }

      if (!response.ok) {
        throw new ProviderError(
          `Sportmonks returned HTTP ${response.status}.`,
          response.status,
          await safeText(response),
        );
      }

      const payload = (await response.json()) as SportmonksEnvelope<T>;

      if (payload.data === undefined || payload.data === null) {
        if (payload.message && !/no result/i.test(payload.message)) {
          throw new ProviderError(
            "Sportmonks returned an error payload.",
            response.status,
            payload.message,
          );
        }

        return { ...payload, data: [] };
      }

      return payload;
    }

    throw lastError ?? new ProviderError("Sportmonks request failed.");
  }
}

function mapSportmonksFixture(raw: SportmonksFixture): ProviderFixture | null {
  if (raw.placeholder) {
    return null;
  }

  const home = raw.participants?.find(
    (participant) => participant.meta?.location === "home",
  );
  const away = raw.participants?.find(
    (participant) => participant.meta?.location === "away",
  );

  if (!home || !away) {
    return null;
  }

  const status = mapStatus(raw.state_id, raw.state?.state);
  const kickoffAt = mapKickoff(raw);

  if (!kickoffAt) {
    return null;
  }

  const score = mapScore(raw.scores, status);
  const season = parseSeasonStart(raw.season?.name);

  return {
    externalId: String(raw.id),
    competition: {
      externalId: String(raw.league_id),
      name: raw.league?.name ?? `League ${raw.league_id}`,
      country: raw.league?.country?.name ?? null,
      logoUrl: raw.league?.image_path ?? null,
      season,
    },
    homeTeam: {
      externalId: String(home.id),
      name: home.name,
      logoUrl: home.image_path ?? null,
    },
    awayTeam: {
      externalId: String(away.id),
      name: away.name,
      logoUrl: away.image_path ?? null,
    },
    kickoffAt,
    status,
    homeScore: score.home,
    awayScore: score.away,
    minute: mapMinute(raw.periods, status),
    round: raw.round?.name ?? null,
    venue: formatVenue(raw.venue),
    rawStatus: raw.state?.state ?? String(raw.state_id),
  };
}

function mapKickoff(raw: SportmonksFixture): string | null {
  const timestamp = raw.starting_at_timestamp;

  if (typeof timestamp === "number" && timestamp > 0) {
    return new Date(timestamp * 1000).toISOString();
  }

  return parseProviderDate(raw.starting_at);
}

function mapScore(
  scores: SportmonksScore[] | null | undefined,
  status: ProviderFixtureStatus,
): { home: number | null; away: number | null } {
  if (
    status === "scheduled" ||
    status === "postponed" ||
    status === "cancelled"
  ) {
    return { home: null, away: null };
  }

  // Settlement is regulation time only. `2ND_HALF` is the score at the end of
  // the second half; `CURRENT` can include extra-time goals. Penalty shootouts
  // (`FT_PEN`) must never leak into a bet result.
  const priorities =
    status === "finished"
      ? ["2ND_HALF", "CURRENT", "1ST_HALF"]
      : ["CURRENT", "2ND_HALF", "1ST_HALF"];

  for (const description of priorities) {
    const entries = (scores ?? []).filter(
      (entry) => entry.description === description,
    );
    const home = entries.find(
      (entry) => entry.score?.participant === "home",
    )?.score?.goals;
    const away = entries.find(
      (entry) => entry.score?.participant === "away",
    )?.score?.goals;

    if (isGoalCount(home) && isGoalCount(away)) {
      return { home, away };
    }
  }

  return { home: null, away: null };
}

function mapMinute(
  periods: SportmonksPeriod[] | null | undefined,
  status: ProviderFixtureStatus,
): number | null {
  if (status !== "live" && status !== "halftime") {
    return null;
  }

  const current = (periods ?? []).find((period) => period.ticking);
  const minutes = current?.minutes ?? maxMinutes(periods ?? []);

  return clampMinute(minutes);
}

function maxMinutes(periods: SportmonksPeriod[]): number | null {
  let max: number | null = null;

  for (const period of periods) {
    if (typeof period.minutes !== "number" || !Number.isFinite(period.minutes)) {
      continue;
    }
    max = max === null ? period.minutes : Math.max(max, period.minutes);
  }

  return max;
}

function clampMinute(minute: number | null | undefined): number | null {
  if (typeof minute !== "number" || !Number.isFinite(minute)) {
    return null;
  }

  return Math.max(0, Math.min(130, Math.trunc(minute)));
}

function formatVenue(
  venue: { name?: string | null; city?: string | null } | null | undefined,
): string | null {
  if (!venue) {
    return null;
  }

  const parts = [venue.name, venue.city].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

const STATUS_BY_ID: Record<number, ProviderFixtureStatus> = {
  1: "scheduled",
  2: "live",
  3: "halftime",
  4: "halftime",
  5: "finished",
  6: "live",
  7: "finished",
  8: "finished",
  9: "live",
  10: "postponed",
  11: "suspended",
  12: "cancelled",
  13: "scheduled",
  14: "finished",
  15: "cancelled",
  16: "postponed",
  17: "finished",
  18: "suspended",
  19: "suspended",
  20: "cancelled",
  21: "halftime",
  22: "live",
  23: "live",
  25: "halftime",
  26: "scheduled",
};

const STATUS_BY_CODE: Record<string, ProviderFixtureStatus> = {
  NS: "scheduled",
  TBA: "scheduled",
  PENDING: "scheduled",
  INPLAY_1ST_HALF: "live",
  INPLAY_2ND_HALF: "live",
  INPLAY_ET: "live",
  INPLAY_ET_2ND_HALF: "live",
  INPLAY_PENALTIES: "live",
  HT: "halftime",
  BREAK: "halftime",
  EXTRA_TIME_BREAK: "halftime",
  PEN_BREAK: "halftime",
  FT: "finished",
  AET: "finished",
  FT_PEN: "finished",
  WO: "finished",
  AWARDED: "finished",
  POSTPONED: "postponed",
  DELAYED: "postponed",
  SUSPENDED: "suspended",
  INTERRUPTED: "suspended",
  AWAITING_UPDATES: "suspended",
  CANCELLED: "cancelled",
  ABANDONED: "cancelled",
  DELETED: "cancelled",
};

function mapStatus(
  stateId: number,
  stateCode: string | null | undefined,
): ProviderFixtureStatus {
  if (stateCode) {
    const mapped = STATUS_BY_CODE[stateCode.toUpperCase()];
    if (mapped) {
      return mapped;
    }
  }

  return STATUS_BY_ID[stateId] ?? "suspended";
}

function mapSportmonksOdds(
  fixtureId: string,
  rows: SportmonksOdd[],
): ProviderOdds | null {
  const byBookmaker = new Map<number, SportmonksOdd[]>();

  for (const row of rows) {
    if (!Number.isFinite(row.market_id) || !Number.isFinite(row.bookmaker_id)) {
      continue;
    }

    const group = byBookmaker.get(row.bookmaker_id);
    if (group) {
      group.push(row);
    } else {
      byBookmaker.set(row.bookmaker_id, [row]);
    }
  }

  const candidates: Array<{
    bookmakerId: number;
    bookmaker: string | null;
    markets: ProviderMarket[];
    updatedAt: string | null;
  }> = [];

  for (const [bookmakerId, group] of byBookmaker) {
    const markets = mapBookmakerMarkets(group);
    if (markets.length === 0) {
      continue;
    }

    candidates.push({
      bookmakerId,
      bookmaker:
        group.find((row) => row.bookmaker?.name)?.bookmaker?.name ?? null,
      markets,
      updatedAt: latestUpdatedAt(group),
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
    if (bUpdated !== aUpdated) {
      return bUpdated - aUpdated;
    }

    return a.bookmakerId - b.bookmakerId;
  });

  const best = candidates[0];

  return {
    fixtureExternalId: fixtureId,
    bookmaker: best.bookmaker,
    markets: best.markets,
    updatedAt: best.updatedAt,
  };
}

function mapBookmakerMarkets(group: SportmonksOdd[]): ProviderMarket[] {
  const byType = new Map<ProviderMarketType, Map<ProviderSelectionName, ProviderSelection>>();

  for (const row of group) {
    const type = MARKET_ID_TO_TYPE[row.market_id];
    if (!type || row.stopped) {
      continue;
    }

    if (type === "OU25" && !isOverUnder25(row.total)) {
      continue;
    }

    const rawLabel = row.label ?? row.name ?? "";
    const name = mapSelectionName(type, rawLabel);
    if (!name) {
      continue;
    }

    const odds = parseOdds(row.value ?? row.dp3);
    if (odds === null) {
      continue;
    }

    let selections = byType.get(type);
    if (!selections) {
      selections = new Map();
      byType.set(type, selections);
    }

    if (!selections.has(name)) {
      selections.set(name, {
        name,
        odds,
        providerValue: rawLabel,
      });
    }
  }

  const markets: ProviderMarket[] = [];

  for (const [type, selections] of byType) {
    if (selections.size < REQUIRED_SELECTIONS[type]) {
      continue;
    }

    markets.push({
      type,
      line: type === "OU25" ? 2.5 : null,
      providerMarketId: String(MARKET_TYPE_TO_ID[type]),
      selections: [...selections.values()],
    });
  }

  return markets;
}

function mapSelectionName(
  type: ProviderMarketType,
  value: string,
): ProviderSelectionName | null {
  const key = normalizeSelection(value);

  if (type === "1X2") {
    if (key === "home" || key === "1" || key === "homewin") return "home";
    if (key === "draw" || key === "x") return "draw";
    if (key === "away" || key === "2" || key === "awaywin") return "away";
    return null;
  }

  if (type === "OU25") {
    if (key === "over") return "over";
    if (key === "under") return "under";
    return null;
  }

  if (type === "BTTS") {
    if (key === "yes") return "yes";
    if (key === "no") return "no";
    return null;
  }

  if (type === "DC") {
    if (
      key === "1x" ||
      key === "x1" ||
      key === "homedraw" ||
      key === "drawhome" ||
      key === "homeordraw"
    ) {
      return "1X";
    }
    if (
      key === "x2" ||
      key === "2x" ||
      key === "drawaway" ||
      key === "awaydraw" ||
      key === "draworaway"
    ) {
      return "X2";
    }
    if (
      key === "12" ||
      key === "21" ||
      key === "homeaway" ||
      key === "awayhome" ||
      key === "homeoraway"
    ) {
      return "12";
    }
    return null;
  }

  return null;
}

function latestUpdatedAt(group: SportmonksOdd[]): string | null {
  let latest: string | null = null;
  let latestTime = 0;

  for (const row of group) {
    const parsed = parseProviderDate(
      row.latest_bookmaker_update ?? row.created_at,
    );
    if (!parsed) {
      continue;
    }

    const time = new Date(parsed).getTime();
    if (time > latestTime) {
      latest = parsed;
      latestTime = time;
    }
  }

  return latest;
}

function parseOdds(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const odds = Number(value);
  if (!Number.isFinite(odds) || odds <= 1 || odds >= 1000) {
    return null;
  }

  return Math.round(odds * 1000) / 1000;
}

function isOverUnder25(total: string | number | null | undefined): boolean {
  if (total === null || total === undefined || total === "") {
    return false;
  }

  const line = Number(total);
  return Number.isFinite(line) && Math.abs(line - 2.5) < 0.001;
}

function normalizeSelection(value: string): string {
  return value.trim().toLowerCase().replace(/[\s/_-]+/g, "");
}

function parseSeasonStart(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  return Number.isInteger(year) && year > 1900 ? year : null;
}

function parseProviderDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isGoalCount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function normalizeData<T>(data: T[] | T | null | undefined): T[] {
  if (data === null || data === undefined) {
    return [];
  }

  return Array.isArray(data) ? data : [data];
}

function readLeagueIds(): number[] {
  const raw = process.env.SPORTMONKS_LEAGUE_IDS;
  if (!raw) {
    return DEFAULT_LEAGUE_IDS;
  }

  const ids = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ids.length > 0 ? ids : DEFAULT_LEAGUE_IDS;
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
