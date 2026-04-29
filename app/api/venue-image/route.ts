import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // NextRequest safely extracts the FULL url, including all & symbols and API keys
  const targetUrl = request.nextUrl.searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing image URL', { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        // Tricks Google into thinking this request is coming from your live production website
        'Referer': 'https://villagefoodie.co.uk/',
        // Tricks Google into thinking Vercel is a standard Google Chrome web browser
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Google API Error ${response.status}:`, errorText);
      return new NextResponse(`Google blocked request: ${response.status}`, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        // Cache the image on Vercel's Edge Network for 1 year to save API costs
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Proxy crashed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}