import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing image URL', { status: 400 });
  }

  try {
    // 👇 THE FIX: We tell Google this request is coming from your authorized domain
    const response = await fetch(targetUrl, {
      headers: {
        'Referer': 'https://villagefoodie.co.uk', 
      }
    });

    if (!response.ok) {
      console.error('Google API blocked the request:', response.status);
      return new NextResponse('Failed to fetch image', { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/jpeg';

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