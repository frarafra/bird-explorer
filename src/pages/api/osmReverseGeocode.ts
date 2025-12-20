import type { NextApiRequest, NextApiResponse } from 'next';

const OPENSTREETMAP_REVERSE_GEOCODE_URL = 'https://nominatim.openstreetmap.org/reverse';

const getLocationName = async (lat: number, lng: number): Promise<string> => {
    const response = await fetch(`${OPENSTREETMAP_REVERSE_GEOCODE_URL}?format=json&lat=${lat}&lon=${lng}`, {
        headers: {
            'User-Agent': 'bird-search-app/1.0 (https://github.com/frarafra/bird-explorer)'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch location name: ${response.statusText}`);
    }
    const data = await response.json();
    return data.display_name || `${lat}, ${lng}`;
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
