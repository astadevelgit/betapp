import "server-only";

import { ApiFootballProvider } from "./api-football";
import { SportmonksProvider } from "./sportmonks";
import {
  ProviderNotConfiguredError,
  type OddsProvider,
} from "./types";

let provider: OddsProvider | undefined;

export function isProviderConfigured(): boolean {
  return Boolean(
    process.env.SPORTMONKS_API_TOKEN || process.env.API_FOOTBALL_KEY,
  );
}

export function getProvider(): OddsProvider {
  if (process.env.SPORTMONKS_API_TOKEN) {
    provider ??= new SportmonksProvider();
    return provider;
  }

  if (process.env.API_FOOTBALL_KEY) {
    provider ??= new ApiFootballProvider();
    return provider;
  }

  throw new ProviderNotConfiguredError();
}
