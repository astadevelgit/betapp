import { getLiveMatches } from "@/lib/catalog/queries";

export async function GET() {
  const matches = await getLiveMatches();

  return Response.json(
    {
      matches,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
