import "server-only";

import { ApiFootballProvider } from "./api-football";
import { SportmonksProvider } from "./sportmonks";
import { TheOddsApiProvider } from "./the-odds-api";
import {
  ProviderError,
  ProviderNotConfiguredError,
  type OddsProvider,
} from "./types";

type ProviderName = "sportmonks" | "api-football" | "the-odds-api";

let provider: OddsProvider | undefined;
let providerName: ProviderName | undefined;

function requestedProvider(): ProviderName | null {
  const raw = process.env.FOOTBALL_PROVIDER?.trim().toLowerCase();

  if (!raw) {
    return null;
  }

  if (
    raw === "sportmonks" ||
    raw === "api-football" ||
    raw === "the-odds-api"
  ) {
    return raw;
  }

  throw new ProviderError(
    `Unknown FOOTBALL_PROVIDER "${raw}". Use sportmonks, api-football, or the-odds-api.`,
  );
}

function hasCredentials(name: ProviderName): boolean {
  if (name === "sportmonks") {
    return Boolean(process.env.SPORTMONKS_API_TOKEN);
  }

  if (name === "api-football") {
    return Boolean(process.env.API_FOOTBALL_KEY);
  }

  return Boolean(process.env.THE_ODDS_API_KEY);
}

function createProvider(name: ProviderName): OddsProvider {
  if (!hasCredentials(name)) {
    throw new ProviderNotConfiguredError(
      name === "sportmonks"
        ? "FOOTBALL_PROVIDER=sportmonks requires SPORTMONKS_API_TOKEN."
        : name === "api-football"
          ? "FOOTBALL_PROVIDER=api-football requires API_FOOTBALL_KEY."
          : "FOOTBALL_PROVIDER=the-odds-api requires THE_ODDS_API_KEY.",
    );
  }

  if (name === "sportmonks") {
    return new SportmonksProvider();
  }

  if (name === "api-football") {
    return new ApiFootballProvider();
  }

  return new TheOddsApiProvider();
}

function autoProviderName(): ProviderName {
  if (process.env.SPORTMONKS_API_TOKEN) {
    return "sportmonks";
  }

  if (process.env.API_FOOTBALL_KEY) {
    return "api-football";
  }

  if (process.env.THE_ODDS_API_KEY) {
    return "the-odds-api";
  }

  throw new ProviderNotConfiguredError();
}

export function isProviderConfigured(): boolean {
  try {
    const requested = requestedProvider();
    return requested ? hasCredentials(requested) : Boolean(
      process.env.SPORTMONKS_API_TOKEN ||
        process.env.API_FOOTBALL_KEY ||
        process.env.THE_ODDS_API_KEY,
    );
  } catch {
    return false;
  }
}

export function getProvider(): OddsProvider {
  const name = requestedProvider() ?? autoProviderName();

  if (provider && providerName === name) {
    return provider;
  }

  provider = createProvider(name);
  providerName = name;
  return provider;
}
