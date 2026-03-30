import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // 1. Grab the requested URL from the search parameters
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing image URL', { status: 400 });
  }

  try {
    // 2. Fetch the image directly from Google Maps API
    // (This server-side fetch automatically follows the hidden 302 redirects)
    const response = await fetch(targetUrl);

    if (!response.ok) {
      console.error('Failed to fetch from Google API:', response.statusText);
      return new NextResponse('Failed to fetch image', { status: response.status });
    }

    // 3. Convert the response into a raw image buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // 4. THE MAGIC TRICK: Return the image with massive Cache-Control headers.
    // This tells Vercel's Edge Network to save this image for a full year (31536000 seconds).
    // Subsequent requests won't hit the route (or Google); Vercel just serves the saved file for free.
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}