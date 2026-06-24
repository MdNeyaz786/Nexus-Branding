import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const text = searchParams.get("text");
  const type = searchParams.get("type"); // "city" or "country"

  if (!text) {
    return NextResponse.json({ error: "Missing 'text' query parameter" }, { status: 400 });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY || process.env.GEOAPIFY_SECRET_KEY;

  if (!apiKey) {
    console.warn("GEOAPIFY_API_KEY is missing in .env.local");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    let apiUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&apiKey=${apiKey}`;
    
    if (type) {
      apiUrl += `&type=${encodeURIComponent(type)}`;
    }

    const response = await fetch(apiUrl);

    if (response.status === 403 || response.status === 429) {
      return NextResponse.json({ error: "Daily limit reached" }, { status: response.status });
    }

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch locations" }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Geoapify proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
