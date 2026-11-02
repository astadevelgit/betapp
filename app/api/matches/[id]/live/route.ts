import { getMatchLiveSnapshot } from "@/lib/catalog/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const snapshot = await getMatchLiveSnapshot(id);

  if (!snapshot) {
    return Response.json(
      { ok: false, error: "Match not found." },
      { status: 404 },
    );
  }

  return Response.json(
    { ok: true, match: snapshot },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
