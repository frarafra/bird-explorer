import type { NextApiRequest, NextApiResponse } from 'next';

import { searchSpecies } from './ebirdSpeciesSearch';

const MAPBOX_REVERSE_GEOCODE_URL = 'https://api.mapbox.com/search/geocode/v6/reverse';

export type ComparisonPointInput = {
  lat: number;
  lng: number;
  dist?: number;
};

const getLocationName = async (lat: number, lng: number): Promise<string> => {
  const response = await fetch(
    `${MAPBOX_REVERSE_GEOCODE_URL}?types=place&access_token=${process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}&longitude=${lng}&latitude=${lat}`,
    {
      headers: {
        'User-Agent': 'bird-search-app/1.0 (https://github.com/frarafra/bird-explorer)',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch location name: ${response.statusText}`);
  }

  const data = await response.json();
  return data.features?.[0]?.properties?.full_address || `${lat}, ${lng}`;
};

async function fetchLocationNames(point1: ComparisonPointInput, point2: ComparisonPointInput) {
  return Promise.allSettled([
    getLocationName(point1.lat, point1.lng),
    getLocationName(point2.lat, point2.lng),
  ]);
}

async function fetchComparisonSpecies(point1: ComparisonPointInput, point2: ComparisonPointInput) {
  return Promise.allSettled([
    searchSpecies({
      lat: point1.lat,
      lng: point1.lng,
      dist: point1.dist ?? 10,
    }),
    searchSpecies({
      lat: point2.lat,
      lng: point2.lng,
      dist: point2.dist ?? 10,
    }),
  ]);
}

function compareBirdLists(species1: Array<{ comName: string }>, species2: Array<{ comName: string }>) {
  const birds1 = [...new Set(species1.map((bird) => bird.comName))] as string[];
  const birds2 = [...new Set(species2.map((bird) => bird.comName))] as string[];

  return {
    commonBirds: birds1.filter((bird) => birds2.includes(bird)),
    uniqueToPoint1: birds1.filter((bird) => !birds2.includes(bird)),
    uniqueToPoint2: birds2.filter((bird) => !birds1.includes(bird)),
  };
}

export async function getComparisonResults({
  point1,
  point2,
}: {
  point1: ComparisonPointInput;
  point2: ComparisonPointInput;
}) {
  const [speciesResults, locationResults] = await Promise.all([
    fetchComparisonSpecies(point1, point2),
    fetchLocationNames(point1, point2),
  ]);

  const species1: Array<{ comName: string }> =
    speciesResults[0].status === 'fulfilled' ? speciesResults[0].value : [];
  const species2: Array<{ comName: string }> =
    speciesResults[1].status === 'fulfilled' ? speciesResults[1].value : [];

  const locationName1 =
    locationResults[0].status === 'fulfilled'
      ? locationResults[0].value
      : `${point1.lat}, ${point1.lng}`;
  const locationName2 =
    locationResults[1].status === 'fulfilled'
      ? locationResults[1].value
      : `${point2.lat}, ${point2.lng}`;

  const comparison = compareBirdLists(species1, species2);

  return {
    point1: {
      species: species1,
      locationName: locationName1,
    },
    point2: {
      species: species2,
      locationName: locationName2,
    },
    comparison,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const lat1 = Number(req.query.lat1);
    const lng1 = Number(req.query.lng1);
    const lat2 = Number(req.query.lat2);
    const lng2 = Number(req.query.lng2);
    const dist = req.query.dist ? Number(req.query.dist) : 10;

    if (
      !Number.isFinite(lat1) ||
      !Number.isFinite(lng1) ||
      !Number.isFinite(lat2) ||
      !Number.isFinite(lng2)
    ) {
      return res.status(400).json({ error: 'Missing or invalid coordinate values.' });
    }

    const data = await getComparisonResults({
      point1: { lat: lat1, lng: lng1, dist },
      point2: { lat: lat2, lng: lng2, dist },
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching comparison results:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
