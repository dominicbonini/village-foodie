import { Metadata } from 'next';

// We fetch directly from the Venues tab just for the social scrapers
const VENUES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQyBxhM8rEpKLs0-iqHVAp0Xn7Ucz8RidtTeMQ0j7zV6nQFlLHxAYbZU9ppuYGUwr3gLydD_zKgeCpD/pub?gid=1190852063&single=true&output=csv';

// A tiny, robust CSV parser to handle commas inside venue names
function parseCSVRow(text: string) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"' && text[i+1] === '"') {
            current += '"'; i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim()); current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result.map(c => c.replace(/^"|"$/g, '').trim());
}

// This function runs on the server specifically for WhatsApp, iMessage, Twitter, etc.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const resolvedParams = await params;
    const slug = resolvedParams.slug;

    try {
        const res = await fetch(`${VENUES_CSV_URL}&t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return {};
        
        const text = await res.text();
        const rows = text.split(/\r?\n/);
        
        // Loop through the CSV to find the specific venue
        for (let i = 1; i < rows.length; i++) {
            const cols = parseCSVRow(rows[i]);
            const venueName = cols[0] || '';
            const venueSlug = venueName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            
            if (venueSlug === slug) {
                const village = cols[1] || '';
                const photoUrl = cols[12] || ''; // Column M (Index 12)
                
                // If we found a photo, inject the Open Graph tags!
                if (photoUrl) {
                    return {
                        title: `${venueName} | Village Foodie`,
                        description: `Check out the upcoming food truck schedule for ${venueName} in ${village}! 🍔🍻`,
                        openGraph: {
                            title: `${venueName} Food Trucks`,
                            description: `Upcoming food truck schedule for ${venueName} in ${village}.`,
                            images: [{ url: photoUrl, width: 1200, height: 630, alt: venueName }],
                        },
                        twitter: {
                            card: 'summary_large_image',
                            title: `${venueName} Food Trucks`,
                            images: [photoUrl],
                        }
                    };
                }
            }
        }
    } catch (e) {
        console.error('Error generating metadata:', e);
    }
    
    // Fallback if no photo is found
    return {};
}

// The layout simply wraps your existing page.tsx without changing how it looks
export default function VenueLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}