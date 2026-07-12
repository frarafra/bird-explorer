import type { NextApiRequest, NextApiResponse } from 'next';

const EBIRD_API_URL = 'https://api.ebird.org/v2/data/nearest/geo/recent';

export async function searchObservations({
  bird,
  lat,
  lng,
}: {
  bird: string;
  lat: number;
  lng: number;
}) {
  const response = await fetch(
    `${EBIRD_API_URL}/${bird}/?lat=${lat}&lng=${lng}`,
    {
      headers: {
        'X-eBirdApiToken': process.env.NEXT_PUBLIC_EBIRD_API_TOKEN || '',
      },
    }
  );

  if (!response.ok) {
    console.error(`Failed to fetch data from eBird API: ${response.headers.values().forEach((value) => console.log(value))}`);
    throw new Error('Failed to fetch data from eBird API');
  }

  return response.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { bird, lat, lng } = req.query;
  const birdName = Array.isArray(bird) ? bird[0] : bird;

  if (!birdName) {
    return res.status(400).json({ error: 'Missing specie parameter' });
  }

  try {
    const data = await searchObservations({
      bird: birdName,
      lat: Number(
        Array.isArray(lat) ? lat[0] : lat ?? process.env.NEXT_PUBLIC_LAT
      ),
      lng: Number(
        Array.isArray(lng) ? lng[0] : lng ?? process.env.NEXT_PUBLIC_LNG
      ),
    });

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
