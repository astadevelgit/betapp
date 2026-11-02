import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY in .env.local.",
  );
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const clean = process.argv.includes("--clean");

if (clean) {
  await cleanDemoData();
  process.exit(0);
}

await seedDemoData();

async function seedDemoData() {
  const { data: sport, error: sportError } = await admin
    .from("sports")
    .select("id")
    .eq("slug", "football")
    .maybeSingle();

  if (sportError || !sport) {
    console.error(
      "Football sport is missing. Apply supabase/migrations/20261102000001_catalog.sql first.",
    );
    process.exit(1);
  }

  const now = Date.now();

  const competitions = [
    {
      external_id: "demo:39",
      name: "Premier League",
      country: "England",
      priority: 10,
    },
    {
      external_id: "demo:2",
      name: "UEFA Champions League",
      country: "Europe",
      priority: 20,
    },
    {
      external_id: "demo:140",
      name: "La Liga",
      country: "Spain",
      priority: 30,
    },
    {
      external_id: "demo:135",
      name: "Serie A",
      country: "Italy",
      priority: 40,
    },
  ];

  const { data: competitionRows, error: competitionError } = await admin
    .from("competitions")
    .upsert(
      competitions.map((competition) => ({
        ...competition,
        sport_id: sport.id,
        source: "demo",
        active: true,
        metadata: { demo: true },
      })),
      { onConflict: "external_id" },
    )
    .select("id, external_id");

  if (competitionError || !competitionRows) {
    console.error("Could not seed competitions:", competitionError?.message);
    process.exit(1);
  }

  const competitionIds = new Map(
    competitionRows.map((row) => [row.external_id, row.id]),
  );

  const teams = [
    ["demo:team-ars", "Arsenal"],
    ["demo:team-che", "Chelsea"],
    ["demo:team-liv", "Liverpool"],
    ["demo:team-mci", "Manchester City"],
    ["demo:team-rma", "Real Madrid"],
    ["demo:team-bar", "Barcelona"],
    ["demo:team-int", "Inter"],
    ["demo:team-mil", "AC Milan"],
    ["demo:team-bay", "Bayern Munich"],
    ["demo:team-psg", "Paris Saint-Germain"],
    ["demo:team-nap", "Napoli"],
    ["demo:team-juv", "Juventus"],
  ];

  const { data: teamRows, error: teamError } = await admin
    .from("teams")
    .upsert(
      teams.map(([external_id, name]) => ({
        external_id,
        name,
        source: "demo",
        metadata: { demo: true },
      })),
      { onConflict: "external_id" },
    )
    .select("id, external_id");

  if (teamError || !teamRows) {
    console.error("Could not seed teams:", teamError?.message);
    process.exit(1);
  }

  const teamIds = new Map(teamRows.map((row) => [row.external_id, row.id]));

  const fixtures = [
    {
      external_id: "demo:match-1",
      competition: "demo:39",
      home: "demo:team-ars",
      away: "demo:team-che",
      kickoff: now - 35 * 60 * 1000,
      status: "live",
      homeScore: 1,
      awayScore: 0,
      minute: 35,
    },
    {
      external_id: "demo:match-2",
      competition: "demo:2",
      home: "demo:team-rma",
      away: "demo:team-bar",
      kickoff: now - 70 * 60 * 1000,
      status: "halftime",
      homeScore: 1,
      awayScore: 1,
      minute: 45,
    },
    {
      external_id: "demo:match-3",
      competition: "demo:39",
      home: "demo:team-liv",
      away: "demo:team-mci",
      kickoff: now + 2 * 60 * 60 * 1000,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      minute: null,
    },
    {
      external_id: "demo:match-4",
      competition: "demo:135",
      home: "demo:team-int",
      away: "demo:team-mil",
      kickoff: now + 4 * 60 * 60 * 1000,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      minute: null,
    },
    {
      external_id: "demo:match-5",
      competition: "demo:2",
      home: "demo:team-bay",
      away: "demo:team-psg",
      kickoff: now + 26 * 60 * 60 * 1000,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      minute: null,
    },
    {
      external_id: "demo:match-6",
      competition: "demo:135",
      home: "demo:team-nap",
      away: "demo:team-juv",
      kickoff: now + 30 * 60 * 60 * 1000,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      minute: null,
    },
    {
      external_id: "demo:match-7",
      competition: "demo:39",
      home: "demo:team-ars",
      away: "demo:team-liv",
      kickoff: now + 50 * 60 * 60 * 1000,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      minute: null,
    },
    {
      external_id: "demo:match-8",
      competition: "demo:140",
      home: "demo:team-che",
      away: "demo:team-mci",
      kickoff: now + 75 * 60 * 60 * 1000,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      minute: null,
    },
  ];

  const { data: matchRows, error: matchError } = await admin
    .from("matches")
    .upsert(
      fixtures.map((fixture) => ({
        external_id: fixture.external_id,
        source: "demo",
        sport_id: sport.id,
        competition_id: competitionIds.get(fixture.competition),
        home_team_id: teamIds.get(fixture.home),
        away_team_id: teamIds.get(fixture.away),
        kickoff_at: new Date(fixture.kickoff).toISOString(),
        status: fixture.status,
        home_score: fixture.homeScore,
        away_score: fixture.awayScore,
        minute: fixture.minute,
        metadata: { demo: true },
        last_synced_at: new Date().toISOString(),
      })),
      { onConflict: "external_id" },
    )
    .select("id, external_id, status");

  if (matchError || !matchRows) {
    console.error("Could not seed matches:", matchError?.message);
    process.exit(1);
  }

  const marketRows = [];
  for (const match of matchRows) {
    const isLive = match.status !== "scheduled";

    marketRows.push(
      {
        match_id: match.id,
        type: "1X2",
        status: isLive ? "suspended" : "open",
        line: null,
        provider_market_id: "demo:1",
        metadata: { demo: true },
      },
      {
        match_id: match.id,
        type: "OU25",
        status: isLive ? "suspended" : "open",
        line: 2.5,
        provider_market_id: "demo:5",
        metadata: { demo: true },
      },
      {
        match_id: match.id,
        type: "BTTS",
        status: isLive ? "suspended" : "open",
        line: null,
        provider_market_id: "demo:8",
        metadata: { demo: true },
      },
      {
        match_id: match.id,
        type: "DC",
        status: isLive ? "suspended" : "open",
        line: null,
        provider_market_id: "demo:12",
        metadata: { demo: true },
      },
    );
  }

  const { data: seededMarkets, error: marketError } = await admin
    .from("markets")
    .upsert(marketRows, { onConflict: "match_id,type" })
    .select("id, match_id, type, status");

  if (marketError || !seededMarkets) {
    console.error("Could not seed markets:", marketError?.message);
    process.exit(1);
  }

  const selectionRows = [];
  for (const market of seededMarkets) {
    const active = market.status === "open";
    const odds =
      market.type === "1X2"
        ? [
            ["home", 1.85],
            ["draw", 3.40],
            ["away", 4.10],
          ]
        : market.type === "OU25"
          ? [
              ["over", 1.90],
              ["under", 1.90],
            ]
          : market.type === "BTTS"
            ? [
                ["yes", 1.75],
                ["no", 2.00],
              ]
            : [
                ["1X", 1.30],
                ["X2", 1.45],
                ["12", 1.35],
              ];

    for (const [name, price] of odds) {
      selectionRows.push({
        market_id: market.id,
        name,
        odds: price,
        active,
        provider_selection_id: `demo:${name}`,
        metadata: { demo: true },
      });
    }
  }

  const marketIds = seededMarkets.map((market) => market.id);
  const { error: deactivateError } = await admin
    .from("selections")
    .update({ active: false })
    .in("market_id", marketIds);

  if (deactivateError) {
    console.error("Could not reset demo selections:", deactivateError.message);
    process.exit(1);
  }

  const { error: selectionError } = await admin
    .from("selections")
    .upsert(selectionRows, { onConflict: "market_id,name" });

  if (selectionError) {
    console.error("Could not seed selections:", selectionError.message);
    process.exit(1);
  }

  console.log(
    `Demo catalog ready: ${competitionRows.length} competitions, ${teamRows.length} teams, ${matchRows.length} matches, ${seededMarkets.length} markets.`,
  );
  console.log("Run `npm run seed:demo -- --clean` to remove demo rows.");
}

async function cleanDemoData() {
  const { error: matchError } = await admin
    .from("matches")
    .delete()
    .eq("source", "demo");

  if (matchError) {
    console.error("Could not delete demo matches:", matchError.message);
    process.exit(1);
  }

  const { error: competitionError } = await admin
    .from("competitions")
    .delete()
    .eq("source", "demo");

  if (competitionError) {
    console.error("Could not delete demo competitions:", competitionError.message);
    process.exit(1);
  }

  const { error: teamError } = await admin
    .from("teams")
    .delete()
    .eq("source", "demo");

  if (teamError) {
    console.error("Could not delete demo teams:", teamError.message);
    process.exit(1);
  }

  console.log("Demo catalog removed.");
}
