import type { NextApiRequest, NextApiResponse } from 'next';
import pLimit from 'p-limit';

const EBIRD_HISTORIC_API_URL = 'https://api.ebird.org/v2/data/obs';
const MAX_CONCURRENT_EBIRD_REQUESTS = 2;
const limitEbirdRequests = pLimit(MAX_CONCURRENT_EBIRD_REQUESTS);

type HistoricBounds = {
  north?: number;
  south?: number;
  east?: number;
  west?: number;
};

const parseQueryValues = (value: string | string[] | undefined) => {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values
    .flatMap((item) => item.split(',').map((entry) => entry.trim()))
    .filter((item) => item.length > 0);
};

const parseBounds = (req: NextApiRequest): HistoricBounds => {
  const north = Array.isArray(req.query.north)
    ? Number(req.query.north[0])
    : Number(req.query.north);
  const south = Array.isArray(req.query.south)
    ? Number(req.query.south[0])
    : Number(req.query.south);
  const east = Array.isArray(req.query.east)
    ? Number(req.query.east[0])
    : Number(req.query.east);
  const west = Array.isArray(req.query.west)
    ? Number(req.query.west[0])
    : Number(req.query.west);

  return {
    north: Number.isFinite(north) ? north : undefined,
    south: Number.isFinite(south) ? south : undefined,
    east: Number.isFinite(east) ? east : undefined,
    west: Number.isFinite(west) ? west : undefined,
  };
};

const filterObservationsByBounds = (
  observations: any[],
  north?: number,
  south?: number,
  east?: number,
  west?: number
) => {
  const bounds = [north, south, east, west].map((value) => Number(value));
  const hasBounds = bounds.every((value) => Number.isFinite(value));

  if (!hasBounds) {
    return observations;
  }

  const minLat = Math.min(north!, south!);
  const maxLat = Math.max(north!, south!);
  const minLng = Math.min(west!, east!);
  const maxLng = Math.max(west!, east!);

  return observations.filter((observation: any) => {
    const lat = Number(observation?.lat);
    const lng = Number(observation?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return false;
    }

    const latInBounds = lat >= minLat && lat <= maxLat;
    const lngInBounds = lng >= minLng && lng <= maxLng;

    return latInBounds && lngInBounds;
  });
};

async function fetchHistoricSpecies({
  subnationalCode,
  locId,
  date,
  north,
  south,
  east,
  west,
}: {
  subnationalCode?: string;
  locId?: string;
  date: string;
  north?: number;
  south?: number;
  east?: number;
  west?: number;
}) {
  if (!subnationalCode && !locId) {
    throw new Error('Missing subnationalCode or locId');
  }

  return limitEbirdRequests(async () => {
    const normalizedDate = date.replace(/-/g, '/');
    const endpoint = locId
      ? `${EBIRD_HISTORIC_API_URL}/${locId}/historic/${normalizedDate}`
      : `${EBIRD_HISTORIC_API_URL}/${subnationalCode}/historic/${normalizedDate}`;

    const response = await fetch(endpoint, {
      headers: {
        'X-eBirdApiToken': process.env.NEXT_PUBLIC_EBIRD_API_TOKEN || '',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch historic data from eBird API');
    }

    const data = await response.json();
    const observations = Array.isArray(data) ? data : [];

    if (!subnationalCode) {
      return observations;
    }

    return filterObservationsByBounds(observations, north, south, east, west);
  });
}

const getSubnationalCodes = (req: NextApiRequest) => {
  const values = parseQueryValues(req.query.subnationalCodes)
    .concat(parseQueryValues(req.query.subnationalCode));

  return Array.from(new Set(values));
};

const getLocIdsFromHistoricResults = (results: PromiseSettledResult<any[] | any>[]) => {
  return Array.from(
    new Set(
      results.flatMap((result) => {
        if (result.status !== 'fulfilled') {
          return [];
        }

        const observations = Array.isArray(result.value) ? result.value : [];

        return observations
          .map((observation: any) => observation?.locId)
          .filter(
            (locId): locId is string =>
              typeof locId === 'string' && locId.trim().length > 0
          );
      })
    )
  );
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const subnationalCodes = getSubnationalCodes(req);
  const rawDate = Array.isArray(req.query.date)
    ? req.query.date[0]
    : req.query.date;
  const bounds = parseBounds(req);

  if (!subnationalCodes.length) {
    return res
      .status(400)
      .json({ error: 'Missing subnationalCode or subnationalCodes parameter' });
  }

  if (!rawDate) {
    return res.status(400).json({ error: 'Missing date parameter' });
  }

  try {
    const seenLocIds = new Set<string>();

    const subnationalResults = await Promise.allSettled(
      subnationalCodes.map(async (subnationalCode) => {
        const observations = await fetchHistoricSpecies({
          subnationalCode,
          date: rawDate,
          ...bounds,
        });

        const locIds = Array.from(
          new Set(
            getLocIdsFromHistoricResults([
              {
                status: 'fulfilled',
                value: observations,
              },
            ])
          )
        ).filter((locId) => {
          if (seenLocIds.has(locId)) {
            return false;
          }

          seenLocIds.add(locId);
          return true;
        });

        const locResults = locIds.length
          ? await Promise.allSettled(
              locIds.map((locId) =>
                fetchHistoricSpecies({
                  locId,
                  date: rawDate,
                  ...bounds,
                })
              )
            )
          : [];

        return [
          ...observations,
          ...locResults.flatMap((result) =>
            result.status === 'fulfilled'
              ? Array.isArray(result.value)
                ? result.value
                : []
              : []
          ),
        ];
      })
    );

    const successfulResults = subnationalResults.flatMap((result) =>
      result.status === 'fulfilled'
        ? Array.isArray(result.value)
          ? result.value
          : []
        : []
    );

    return res.status(200).json(successfulResults);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
