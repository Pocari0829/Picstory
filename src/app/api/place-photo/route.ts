import { NextResponse } from "next/server";

const PHOTO_NAME = /^places\/[^/]+\/photos\/[^/]+$/;

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name");
  if (!name || !PHOTO_NAME.test(name)) {
    return NextResponse.json({ error: "invalid_photo" }, { status: 400 });
  }

  const placesKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.PLACES_API_KEY;
  if (!placesKey) {
    return NextResponse.json({ error: "server_api_keys_missing" }, { status: 500 });
  }

  const response = await fetch(
    `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${encodeURIComponent(placesKey)}`,
    { cache: "force-cache" },
  );
  if (!response.ok) {
    return NextResponse.json({ error: "photo_unavailable" }, { status: response.status });
  }

  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
    },
  });
}