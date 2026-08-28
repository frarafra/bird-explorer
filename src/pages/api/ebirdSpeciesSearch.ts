import type { NextApiRequest, NextApiResponse } from 'next';

import { getRedisClient } from '../../client/redis';

const redis = getRedisClient();

const EBIRD_OBS_API_URL = 'https://api.ebird.org/v2/data/obs/geo/recent';

export async function searchSpecies({
  lat,
  lng,
  dist,
}: {
  lat: number;
  lng: number;
  dist?: number;
}) {
  const cacheKey = `ebirdSpeciesSearch:${process.env.NEXT_PUBLIC_LAT}:${process.env.NEXT_PUBLIC_LNG}`;

  const isDefaultLocation =
    lat === Number(process.env.NEXT_PUBLIC_LAT) &&
    lng === Number(process.env.NEXT_PUBLIC_LNG);

  if (isDefaultLocation) {
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }
  }

  const response = await fetch(
    `${EBIRD_OBS_API_URL}?sort=species&lat=${lat}&lng=${lng}${
      dist ? `&dist=${dist}` : ""
    }`,
    {
      headers: {
        "X-eBirdApiToken":
          process.env.NEXT_PUBLIC_EBIRD_API_TOKEN!,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch data from eBird API");
  }

  const data = await response.json();

  if (isDefaultLocation) {
    await redis.set(
      cacheKey,
      JSON.stringify(data),
      "EX",
      24 * 60 * 60
    );
  }

  return data;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const data = await searchSpecies({
      lat: Number(req.query.lat ?? process.env.NEXT_PUBLIC_LAT),
      lng: Number(req.query.lng ?? process.env.NEXT_PUBLIC_LNG),
      dist: req.query.dist
        ? Number(req.query.dist)
        : undefined,
    });

    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Internal Server Error",
    });
  }
}