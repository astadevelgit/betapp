import type {
  ProviderCompetition,
  ProviderFixture,
  ProviderFixtureStatus,
  ProviderMarket,
  ProviderMarketType,
  ProviderOdds,
  ProviderSelection,
  ProviderSelectionName,
  ProviderTeam,
} from "./types";

export interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    venue?: { name?: string | null; city?: string | null } | null;
    status: {
      long: string;
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    season: number;
    round?: string | null;
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
  score?: {
    fulltime?: { home: number | null; away: number | null } | null;
  } | null;
}

export interface ApiOdds {
  fixture: { id: number };
  update: string;
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
}

const STATUS_MAP: Record<string, ProviderFixtureStatus> = {
  TBD: "scheduled",
  NS: "scheduled",
  "1H": "live",
  "2H": "live",
  ET: "live",
  BT: "live",
  P: "live",
  LIVE: "live",
  INT: "live",
  HT: "halftime",
  FT: "finished",
  AET: "finished",
  PEN: "finished",
  AWD: "finished",
  WO: "finished",
  PST: "postponed",
  CANC: "cancelled",
  ABD: "cancelled",
  SUSP: "suspended",
};

const MARKET_MAP: Record<string, ProviderMarketType> = {
  "match winner": "1X2",
  "over/under": "OU25",
  "both teams score": "BTTS",
  "double chance": "DC",
};

const REQUIRED_SELECTIONS: Record<ProviderMarketType, number> = {
  "1X2": 3,
  OU25: 2,
  BTTS: 2,
  DC: 3,
};

export function mapStatus(short: string): ProviderFixtureStatus {
  return STATUS_MAP[short.toUpperCase()] ?? "suspended";
}

export function mapFixture(raw: ApiFixture): ProviderFixture {
  const status = mapStatus(raw.fixture.status.short);
  const finalScore =
    status === "finished"
      ? (raw.score?.fulltime ?? raw.goals)
      : raw.goals;

  return {
    externalId: String(raw.fixture.id),
    competition: mapCompetition(raw),
    homeTeam: mapTeam(raw.teams.home),
    awayTeam: mapTeam(raw.teams.away),
    kickoffAt: new Date(raw.fixture.date).toISOString(),
    status,
    homeScore: finalScore.home,
    awayScore: finalScore.away,
    minute: clampMinute(raw.fixture.status.elapsed),
    round: raw.league.round ?? null,
    venue: formatVenue(raw.fixture.venue),
    rawStatus: raw.fixture.status.short,
  };
}

function mapCompetition(raw: ApiFixture): ProviderCompetition {
  return {
    externalId: String(raw.league.id),
    name: raw.league.name,
    country: raw.league.country || null,
    logoUrl: raw.league.logo || null,
    season: raw.league.season ?? null,
  };
}

function mapTeam(team: { id: number; name: string; logo: string }): ProviderTeam {
  return {
    externalId: String(team.id),
    name: team.name,
    logoUrl: team.logo || null,
  };
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

function clampMinute(minute: number | null): number | null {
  if (minute === null || !Number.isFinite(minute)) {
    return null;
  }
  return Math.max(0, Math.min(130, Math.trunc(minute)));
}

export function mapOdds(raw: ApiOdds): ProviderOdds | null {
  const bookmaker = pickBookmaker(raw.bookmakers);
  if (!bookmaker) {
    return null;
  }

  const markets: ProviderMarket[] = [];

  for (const bet of bookmaker.bets) {
    const type = MARKET_MAP[normalize(bet.name)];
    if (!type) {
      continue;
    }

    const selections = mapSelections(type, bet.values);
    if (selections.length < REQUIRED_SELECTIONS[type]) {
      continue;
    }

    markets.push({
      type,
      line: type === "OU25" ? 2.5 : null,
      providerMarketId: String(bet.id),
      selections,
    });
  }

  if (markets.length === 0) {
    return null;
  }

  return {
    fixtureExternalId: String(raw.fixture.id),
    bookmaker: bookmaker.name,
    markets,
    updatedAt: parseDate(raw.update),
  };
}

function pickBookmaker(
  bookmakers: ApiOdds["bookmakers"],
): ApiOdds["bookmakers"][number] | null {
  let best: ApiOdds["bookmakers"][number] | null = null;
  let bestScore = 0;

  for (const bookmaker of bookmakers) {
    const score = bookmaker.bets.filter(
      (bet) => MARKET_MAP[normalize(bet.name)],
    ).length;

    if (score > bestScore) {
      best = bookmaker;
      bestScore = score;
    }
  }

  return best;
}

function mapSelections(
  type: ProviderMarketType,
  values: Array<{ value: string; odd: string }>,
): ProviderSelection[] {
  const seen = new Set<ProviderSelectionName>();
  const selections: ProviderSelection[] = [];

  for (const value of values) {
    const name = mapSelectionName(type, value.value);
    if (!name || seen.has(name)) {
      continue;
    }

    const odds = Number(value.odd);
    if (!Number.isFinite(odds) || odds <= 1 || odds >= 1000) {
      continue;
    }

    seen.add(name);
    selections.push({
      name,
      odds: Math.round(odds * 1000) / 1000,
      providerValue: value.value,
    });
  }

  return selections;
}

export function mapSelectionName(
  type: ProviderMarketType,
  value: string,
): ProviderSelectionName | null {
  const key = normalize(value).replace(/[\s/_-]+/g, "");

  if (type === "1X2") {
    if (key === "home" || key === "1") return "home";
    if (key === "draw" || key === "x") return "draw";
    if (key === "away" || key === "2") return "away";
    return null;
  }

  if (type === "OU25") {
    if (key.includes("over") && key.includes("2.5")) return "over";
    if (key.includes("under") && key.includes("2.5")) return "under";
    return null;
  }

  if (type === "BTTS") {
    if (key === "yes") return "yes";
    if (key === "no") return "no";
    return null;
  }

  if (type === "DC") {
    if (key === "1x" || key === "homedraw" || key === "drawhome") {
      return "1X";
    }
    if (key === "x2" || key === "drawaway" || key === "awaydraw") {
      return "X2";
    }
    if (key === "12" || key === "homeaway" || key === "awayhome") {
      return "12";
    }
    return null;
  }

  return null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
