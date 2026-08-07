import type { NextApiRequest, NextApiResponse } from 'next';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rawLocation = req.query.location ?? req.query.q;
  const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;

  if (!location) {
    return res.status(400).json({ error: 'Missing location parameter' });
  }

  try {
    const response = await fetch(`${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(location)}&format=jsonv2`, {
      headers: {
        'User-Agent': 'bird-search-app/1.0 (https://github.com/frarafra/bird-explorer)'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch geocoding data: ${response.statusText}`);
    }

    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : null;

    if (!firstResult) {
      return res.status(404).json({ error: 'No location found' });
    }

    return res.status(200).json({
      lat: Number(firstResult.lat),
      lon: Number(firstResult.lon),
    });
  } catch (error) {
    console.error('Error in Nominatim lookup:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
