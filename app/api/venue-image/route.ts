import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // 👇 THE MAGIC FIX: We manually split the string to guarantee we grab the ENTIRE Google URL, 
  // bypassing Next.js's tendency to chop off the '&' symbols.
  const rawUrlString = request.url.split('?url=')[1];

  if (!rawUrlString) {
    return new NextResponse('Missing image URL', { status: 400 });
  }

  // Decode the URL so it's a perfect Google Maps string again
  const targetUrl = decodeURIComponent(rawUrlString);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'Referer': 'https://villagefoodie.co.uk/', 
        'User-Agent': 'Mozilla/5.0 (compatible; VillageFoodieBot/1.0)'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      console.error('Google API Error:', response.status);
      return new NextResponse(`Google API Error ${response.status}`, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        // Caches the image for a full year on Vercel so you are never charged twice
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new NextResponse(`Internal Server Error`, { status: 500 });
  }
}