import "server-only";

import { mapFixture, mapOdds, type ApiFixture, type ApiOdds } from "./mapping";
import {
  ProviderError,
  type OddsProvider,
  type ProviderCompetition,
  type ProviderFixture,
  type ProviderOdds,
} from "./types";

interface ApiEnvelope<T> {
  get?: string;
  parameters?: Record<string, unknown>;
  errors?: unknown;
  results?: number;
  paging?: { current: number; total: number };
  response: T[];
}

interface ApiLeague {
  league: {
    id: number;
    name: string;
    type: string;
    logo: string;
  };
  country: {
    name: string;
    code: string | null;
    flag: string | null;
  };
  seasons: Array<{ year: number; current: boolean }>;
}

const DEFAULT_LEAGUE_IDS = [39, 140, 135, 78, 61, 2];
const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";
const MAX_PAGES = 3;
const REQUEST_TIMEOUT_MS = 15_000;

export class ApiFootballProvider implements OddsProvider {
  readonly name = "api-football";

  private readonly key: string;
  private readonly baseUrl: string;
  private readonly leagueIds: number[];
  private readonly season: number;

  constructor(options?: {
    key?: string;
    baseUrl?: string;
    leagueIds?: number[];
    season?: number;
  }) {
    this.key = options?.key ?? process.env.API_FOOTBALL_KEY ?? "";
    this.baseUrl = (
      options?.baseUrl ??
      process.env.API_FOOTBALL_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/$/, "");
    this.leagueIds = options?.leagueIds ?? readLeagueIds();
    this.season = options?.season ?? readSeason();
  }

  async getCompetitions(): Promise<ProviderCompetition[]> {
    const response = await this.request<ApiLeague>("/leagues", {
      current: "true",
    });
    const selected = new Set(this.leagueIds);

    return response
      .filter((entry) => selected.has(entry.league.id))
      .map((entry) => {
        const currentSeason =
          entry.seasons.find((season) => season.current)?.year ?? null;

        return {
          externalId: String(entry.league.id),
          name: entry.league.name,
          country: entry.country.name || null,
          logoUrl: entry.league.logo || null,
          season: currentSeason,
        };
      });
  }

  async getFixtures(params: {
    from: string;
    to: string;
    leagueIds?: number[];
  }): Promise<ProviderFixture[]> {
    const leagueIds = params.leagueIds ?? this.leagueIds;
    const fixtures: ProviderFixture[] = [];

    for (const leagueId of leagueIds) {
      const response = await this.request<ApiFixture>(
        "/fixtures",
        {
          from: params.from,
          to: params.to,
          league: String(leagueId),
          season: String(this.season),
          timezone: "UTC",
        },
        { paginate: true },
      );

      fixtures.push(...response.map(mapFixture));
    }

    return dedupeFixtures(fixtures);
  }

  async getLiveFixtures(): Promise<ProviderFixture[]> {
    const response = await this.request<ApiFixture>(
      "/fixtures",
      {
        live: "all",
        timezone: "UTC",
      },
      { paginate: true },
    );
    const selected = new Set(this.leagueIds);

    return dedupeFixtures(
      response
        .filter((fixture) => selected.has(fixture.league.id))
        .map(mapFixture),
    );
  }

  async getOdds(fixtureId: string): Promise<ProviderOdds | null> {
    const response = await this.request<ApiOdds>("/odds", {
      fixture: fixtureId,
    });

    const matching = response.find(
      (entry) => String(entry.fixture.id) === fixtureId,
    );
    return matching ? mapOdds(matching) : null;
  }

  async getResults(params: { date: string }): Promise<ProviderFixture[]> {
    const response = await this.request<ApiFixture>(
      "/fixtures",
      {
        date: params.date,
        timezone: "UTC",
      },
      { paginate: true },
    );
    const selected = new Set(this.leagueIds);

    return dedupeFixtures(
      response
        .filter((fixture) => selected.has(fixture.league.id))
        .map(mapFixture),
    );
  }

  private async request<T>(
    path: string,
    params: Record<string, string>,
    options?: { paginate?: boolean },
  ): Promise<T[]> {
    if (!this.key) {
      throw new ProviderError("API-Football key is missing.", 401);
    }

    const results: T[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const payload = await this.requestPage<T>(path, {
        ...params,
        ...(options?.paginate ? { page: String(page) } : {}),
      });

      results.push(...payload.response);

      const totalPages = payload.paging?.total ?? 1;
      if (!options?.paginate || page >= totalPages) {
        break;
      }
    }

    return results;
  }

  private async requestPage<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<ApiEnvelope<T>> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    let lastError: ProviderError | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;

      try {
        response = await fetch(url, {
          headers: {
            "x-apisports-key": this.key,
            accept: "application/json",
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (error) {
        lastError = new ProviderError(
          `API-Football request failed: ${path}`,
          null,
          error,
        );
        await sleep(500 * (attempt + 1));
        continue;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 1);
        lastError = new ProviderError(
          "API-Football rate limit reached.",
          429,
        );
        await sleep(Math.max(1, retryAfter) * 1000);
        continue;
      }

      if (!response.ok) {
        throw new ProviderError(
          `API-Football returned HTTP ${response.status}.`,
          response.status,
          await safeText(response),
        );
      }

      const payload = (await response.json()) as ApiEnvelope<T>;
      const errors = payload.errors;

      if (
        (Array.isArray(errors) && errors.length > 0) ||
        (!Array.isArray(errors) &&
          errors &&
          typeof errors === "object" &&
          Object.keys(errors).length > 0)
      ) {
        throw new ProviderError(
          "API-Football returned an error payload.",
          response.status,
          errors,
        );
      }

      return payload;
    }

    throw lastError ?? new ProviderError("API-Football request failed.");
  }
}

function readLeagueIds(): number[] {
  const raw = process.env.API_FOOTBALL_LEAGUE_IDS;
  if (!raw) {
    return DEFAULT_LEAGUE_IDS;
  }

  const ids = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return ids.length > 0 ? ids : DEFAULT_LEAGUE_IDS;
}

function readSeason(): number {
  const configured = Number(process.env.API_FOOTBALL_SEASON);
  if (Number.isInteger(configured) && configured > 2000) {
    return configured;
  }

  const now = new Date();
  return now.getUTCMonth() >= 6
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
}

function dedupeFixtures(fixtures: ProviderFixture[]): ProviderFixture[] {
  const seen = new Map<string, ProviderFixture>();
  for (const fixture of fixtures) {
    seen.set(fixture.externalId, fixture);
  }
  return [...seen.values()];
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
