import type { NextApiRequest, NextApiResponse } from 'next';

import { getRedisClient } from '../../client/redis';

const redis = getRedisClient();

const EBIRD_OBS_API_URL = 'https://api.ebird.org/v2/data/obs/geo/recent';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { lat, lng } = req.query;
  const cacheKey = `ebirdSpeciesSearch:${lat}:${lng}`;

  try {
    let cachedData = await redis.get(cacheKey);

    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    const response = await fetch(`${EBIRD_OBS_API_URL}/?lat=${lat || process.env.NEXT_PUBLIC_LAT}&lng=${lng || process.env.NEXT_PUBLIC_LNG}`, {
      headers: {
        'X-eBirdApiToken': process.env.NEXT_PUBLIC_EBIRD_API_TOKEN || '',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch data from eBird API');
    }

    const data = await response.json();

    await redis.set(cacheKey, JSON.stringify(data), 'EX', 24 * 60 * 60);

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}