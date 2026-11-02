import type {
  CatalogMarketType,
  CatalogSelectionName,
} from "./types";

export const MARKET_LABELS: Record<CatalogMarketType, string> = {
  "1X2": "Match result",
  OU25: "Total goals",
  BTTS: "Both teams to score",
  DC: "Double chance",
};

export const MARKET_HINTS: Record<CatalogMarketType, string> = {
  "1X2": "Pick the winner, or the draw.",
  OU25: "Over or under 2.5 goals.",
  BTTS: "Will both teams score?",
  DC: "Two outcomes from one match.",
};

export function selectionLabel(
  type: CatalogMarketType,
  name: CatalogSelectionName,
): string {
  if (type === "1X2") {
    if (name === "home") return "Home";
    if (name === "draw") return "Draw";
    if (name === "away") return "Away";
  }

  if (type === "OU25") {
    if (name === "over") return "Over 2.5";
    if (name === "under") return "Under 2.5";
  }

  if (type === "BTTS") {
    if (name === "yes") return "Yes";
    if (name === "no") return "No";
  }

  if (type === "DC") {
    if (name === "1X") return "1X";
    if (name === "X2") return "X2";
    if (name === "12") return "12";
  }

  return name;
}

export function selectionHint(
  type: CatalogMarketType,
  name: CatalogSelectionName,
  homeTeam: string,
  awayTeam: string,
): string {
  if (type === "1X2") {
    if (name === "home") return homeTeam;
    if (name === "away") return awayTeam;
    return "Draw";
  }

  if (type === "DC") {
    if (name === "1X") return `${homeTeam} or draw`;
    if (name === "X2") return `Draw or ${awayTeam}`;
    if (name === "12") return `${homeTeam} or ${awayTeam}`;
  }

  if (type === "OU25") {
    return name === "over" ? "3 goals or more" : "2 goals or fewer";
  }

  if (type === "BTTS") {
    return name === "yes" ? "Both teams score" : "At least one clean sheet";
  }

  return "";
}
