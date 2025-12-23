import type { NextApiRequest, NextApiResponse } from 'next';

const MAPBOX_REVERSE_GEOCODE_URL = 'https://api.mapbox.com/search/geocode/v6/reverse';

const getLocationName = async (lat: number, lng: number): Promise<string> => {
    const response = await fetch(`${MAPBOX_REVERSE_GEOCODE_URL}?types=place&access_token=${process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}&longitude=${lng}&latitude=${lat}`, {
        headers: {
            'User-Agent': 'bird-search-app/1.0 (https://github.com/frarafra/bird-explorer)'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch location name: ${response.statusText}`);
    }
    const data = await response.json();

    return data.features[0]?.properties?.full_address || `${lat}, ${lng}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({ error: 'Missing lat or lng parameter' });
    }

    try {
        const locationName = await getLocationName(Number(lat), Number(lng));
        res.status(200).json({ locationName });
    } catch (error) {
        console.error('Error in reverse geocoding:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
