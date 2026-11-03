// The Odds API returns team names only. Keep a local crest registry for the
// clubs it covers so catalog syncs do not depend on another provider or CDN.
const EPL_TEAM_LOGOS: Record<string, string> = {
  arsenal: "/teams/epl/arsenal.png",
  "aston villa": "/teams/epl/aston-villa.png",
  bournemouth: "/teams/epl/afc-bournemouth.png",
  brentford: "/teams/epl/brentford.png",
  "brighton and hove albion": "/teams/epl/brighton-and-hove-albion.png",
  brighton: "/teams/epl/brighton-and-hove-albion.png",
  chelsea: "/teams/epl/chelsea.png",
  "coventry city": "/teams/epl/coventry-city.png",
  "crystal palace": "/teams/epl/crystal-palace.png",
  everton: "/teams/epl/everton.png",
  fulham: "/teams/epl/fulham.png",
  "hull city": "/teams/epl/hull-city.png",
  "ipswich town": "/teams/epl/ipswich-town.png",
  "leeds united": "/teams/epl/leeds-united.png",
  liverpool: "/teams/epl/liverpool-fc.png",
  "manchester city": "/teams/epl/manchester-city.png",
  "man city": "/teams/epl/manchester-city.png",
  "manchester united": "/teams/epl/manchester-united.png",
  "man united": "/teams/epl/manchester-united.png",
  "man utd": "/teams/epl/manchester-united.png",
  "newcastle united": "/teams/epl/newcastle-united.png",
  newcastle: "/teams/epl/newcastle-united.png",
  "nottingham forest": "/teams/epl/nottingham-forest.png",
  sunderland: "/teams/epl/sunderland.png",
  "tottenham hotspur": "/teams/epl/tottenham-hotspur.png",
  tottenham: "/teams/epl/tottenham-hotspur.png",
  spurs: "/teams/epl/tottenham-hotspur.png",
};

export function eplTeamLogoUrl(teamName: string): string | null {
  return EPL_TEAM_LOGOS[normalizeTeamName(teamName)] ?? null;
}

function normalizeTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(?:afc|fc|cf)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
