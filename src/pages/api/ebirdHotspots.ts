import type { NextApiRequest, NextApiResponse } from 'next';

import { getRedisClient } from '../../client/redis';
import type { Hotspot } from '../../types';

const redis = getRedisClient();

const EBIRD_HOTSPOT_API_URL = 'https://api.ebird.org/v2/ref/hotspot/geo?fmt=json';

const isRecentObservation = (location: Hotspot) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const obsDate = location.latestObsDt ? new Date(location.latestObsDt.replace(" ", "T")) : null;

  return obsDate && obsDate >= thirtyDaysAgo;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { lat, lng, dist } = req.query;
  const cacheKey = `ebirdHotspots:${process.env.NEXT_PUBLIC_LAT}:${process.env.NEXT_PUBLIC_LNG}`;
  let cachedData;

  try {
    if (Number(lat) === Number(process.env.NEXT_PUBLIC_LAT) && Number(lng) === Number(process.env.NEXT_PUBLIC_LNG)) {
        cachedData = await redis.get(cacheKey);
    }

    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    const response = await fetch(`${EBIRD_HOTSPOT_API_URL}&lat=${lat || process.env.NEXT_PUBLIC_LAT}&lng=${lng || process.env.NEXT_PUBLIC_LNG}${dist ? `&dist=${dist}` : ''}`, {
      headers: {
        'X-eBirdApiToken': process.env.NEXT_PUBLIC_EBIRD_API_TOKEN || '',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch hotspots from eBird API');
    }

    const data = (await response.json()).filter(isRecentObservation);

    if (Number(lat) === Number(process.env.NEXT_PUBLIC_LAT) && Number(lng) === Number(process.env.NEXT_PUBLIC_LNG)) {
      await redis.set(cacheKey, JSON.stringify(data), 'EX', 30 * 24 * 60 * 60);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}