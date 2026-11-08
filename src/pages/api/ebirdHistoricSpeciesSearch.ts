import type { NextApiRequest, NextApiResponse } from 'next';

import { getRedisClient } from '../../client/redis';

const EBIRD_HISTORIC_API_URL = 'https://api.ebird.org/v2/data/obs';
const HISTORIC_SUBNATIONAL_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

type HistoricBounds = {
  north?: number;
  south?: number;
  east?: number;
  west?: number;
};

type HistoricObservation = {
  locId?: unknown;
  [key: string]: unknown;
};

type StreamMessage =
  | { type: 'observations'; observations: HistoricObservation[] }
  | { type: 'error'; message: string }
  | { type: 'progress'; message: string };

class EbirdApiError extends Error {
  constructor(
    readonly status: number,
    statusText: string
  ) {
    super(`eBird historic API returned ${status} ${statusText}`);
  }
}

const isLocationId = (value: unknown): value is { locId: string } =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'locId' in value &&
      typeof value.locId === 'string'
  );

const getQueryValues = (value: string | string[] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const parseQueryValues = (values: string[]) =>
  Array.from(
    new Set(
      values
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

const parseBound = (value: string | undefined) => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseBounds = (query: NextApiRequest['query']): HistoricBounds => ({
  north: parseBound(Array.isArray(query.north) ? query.north[0] : query.north),
  south: parseBound(Array.isArray(query.south) ? query.south[0] : query.south),
  east: parseBound(Array.isArray(query.east) ? query.east[0] : query.east),
  west: parseBound(Array.isArray(query.west) ? query.west[0] : query.west),
});

const hasCompleteBounds = ({
  north,
  south,
  east,
  west,
}: HistoricBounds) =>
  [north, south, east, west].every((value) => value !== undefined);

const filterObservationsByBounds = (
  observations: HistoricObservation[],
  { north, south, east, west }: HistoricBounds
) => {
  if (!hasCompleteBounds({ north, south, east, west })) {
    return observations;
  }

  const minLat = Math.min(north!, south!);
  const maxLat = Math.max(north!, south!);

  return observations.filter((observation) => {
    const lat = Number(observation.lat);
    const lng = Number(observation.lng);
    const longitudeInBounds =
      west! <= east!
        ? lng >= west! && lng <= east!
        : lng >= west! || lng <= east!;

    return (
      Number.isFinite(lat) &&
      lat >= minLat &&
      lat <= maxLat &&
      Number.isFinite(lng) &&
      longitudeInBounds
    );
  });
};

const fetchEbirdResponse = async (endpoint: string, signal?: AbortSignal) => {
  return fetch(endpoint, {
    headers: {
      'X-eBirdApiToken': process.env.NEXT_PUBLIC_EBIRD_API_TOKEN || '',
    },
    signal,
  });
};

async function fetchHistoricSpecies({
  subnationalCode,
  locId,
  date,
  bounds,
  onBoundedObservations,
  signal,
}: {
  subnationalCode?: string;
  locId?: string;
  date: string;
  bounds?: HistoricBounds;
  onBoundedObservations?: (
    observations: HistoricObservation[]
  ) => Promise<void>;
  signal?: AbortSignal;
}) {
  if (!subnationalCode && !locId) {
    throw new Error('Missing subnationalCode or locId');
  }

  const normalizedDate = date.replace(/-/g, '/');
  const endpoint = locId
    ? `${EBIRD_HISTORIC_API_URL}/${locId}/historic/${normalizedDate}`
    : `${EBIRD_HISTORIC_API_URL}/${subnationalCode}/historic/${normalizedDate}`;

  const redis = subnationalCode ? getRedisClient() : null;
  const cacheKey = subnationalCode
    ? `ebirdHistoricSubnationalLocIds:${encodeURIComponent(subnationalCode)}:${normalizedDate}`
    : null;
  const cachedData =
    cacheKey && redis && !bounds ? await redis.get(cacheKey) : null;

  if (cachedData) {
    const cachedLocationIds: unknown = JSON.parse(cachedData);
    if (
      !Array.isArray(cachedLocationIds) ||
      !cachedLocationIds.every(isLocationId)
    ) {
      throw new Error(
        `Invalid cached historic location IDs for ${subnationalCode}`
      );
    }

    return cachedLocationIds.map(({ locId }) => ({ locId }));
  }

  const response = await fetchEbirdResponse(endpoint, signal);

  if (!response.ok) {
    throw new EbirdApiError(
      response.status,
      response.statusText
    );
  }

  const data: unknown = await response.json();
  const observations: HistoricObservation[] = Array.isArray(data) ? data : [];

  if (!subnationalCode) {
    return observations;
  }

  const observationsInBounds = bounds
    ? filterObservationsByBounds(observations, bounds)
    : observations;

  if (observationsInBounds.length && onBoundedObservations) {
    await onBoundedObservations(observationsInBounds);
  }

  const locationIds = getLocIds(observations).map((locId) => ({ locId }));

  if (cacheKey && redis) {
    await redis.set(
      cacheKey,
      JSON.stringify(locationIds),
      'EX',
      HISTORIC_SUBNATIONAL_CACHE_TTL_SECONDS
    );
  }

  return getLocIds(observationsInBounds).map((locId) => ({ locId }));
}

const getLocIds = (observations: HistoricObservation[]) =>
  Array.from(
    new Set(
      observations
        .map((observation) => observation?.locId)
        .filter(
          (locId): locId is string =>
            typeof locId === 'string' && locId.trim().length > 0
        )
    )
  );

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown historic fetch error';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const subnationalCodes = parseQueryValues([
    ...getQueryValues(req.query.subnationalCodes),
    ...getQueryValues(req.query.subnationalCode),
  ]);
  const date = Array.isArray(req.query.date)
    ? req.query.date[0]
    : req.query.date;

  if (!subnationalCodes.length) {
    return res
      .status(400)
      .json({ error: 'Missing subnationalCode or subnationalCodes parameter' });
  }
  if (!date) {
    return res.status(400).json({ error: 'Missing date parameter' });
  }

  const bounds = parseBounds(req.query);
  if (!hasCompleteBounds(bounds)) {
    return res.status(400).json({ error: 'Missing or invalid map bounds' });
  }

  const abortController = new AbortController();
  let cancelled = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      cancelled = true;
      abortController.abort();
    }
  });

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = async (message: StreamMessage) => {
    if (cancelled || res.writableEnded) {
      return;
    }

    if (!res.write(`${JSON.stringify(message)}\n`)) {
      await new Promise<void>((resolve) => {
        const onDrain = () => {
          res.off('close', onClose);
          resolve();
        };
        const onClose = () => {
          res.off('drain', onDrain);
          resolve();
        };
        res.once('drain', onDrain);
        res.once('close', onClose);
      });
    }
  };

  res.flushHeaders();
  await send({ type: 'progress', message: 'Historic search started' });

  try {
    const seenLocIds = new Set<string>();
    let rateLimited = false;

    for (const subnationalCode of subnationalCodes) {
      if (cancelled || rateLimited) {
        break;
      }

      try {
        const locationResults = await fetchHistoricSpecies({
          subnationalCode,
          date,
          bounds,
          onBoundedObservations: (observations) =>
            send({ type: 'observations', observations }),
          signal: abortController.signal,
        });
        const locIds = getLocIds(locationResults).filter((locId) => {
          if (seenLocIds.has(locId)) {
            return false;
          }
          seenLocIds.add(locId);
          return true;
        });

        await send({
          type: 'progress',
          message: `Found ${locIds.length} locations for ${subnationalCode}`,
        });

        for (const locId of locIds) {
          if (cancelled || rateLimited) {
            break;
          }
          try {
            await send({
              type: 'progress',
              message: `Fetching observations for ${locId}`,
            });
            const observations = await fetchHistoricSpecies({
              locId,
              date,
              signal: abortController.signal,
            });
            const observationsInBounds = filterObservationsByBounds(
              observations,
              bounds
            );
            await send({
              type: 'progress',
              message: `${locId}: ${observationsInBounds.length} of ${observations.length} observations within map bounds`,
            });
            if (observationsInBounds.length) {
              await send({
                type: 'observations',
                observations: observationsInBounds,
              });
            }
          } catch (error) {
            if (cancelled) {
              break;
            }
            console.error(
              `Failed to fetch historic observations for ${locId}:`,
              error
            );
            await send({ type: 'error', message: errorMessage(error) });
            rateLimited =
              error instanceof EbirdApiError && error.status === 429;
          }
        }
      } catch (error) {
        if (cancelled) {
          break;
        }
        console.error(
          `Failed to fetch historic location IDs for ${subnationalCode}:`,
          error
        );
        await send({ type: 'error', message: errorMessage(error) });
        rateLimited =
          error instanceof EbirdApiError && error.status === 429;
      }
    }
  } catch (error) {
    console.error('Historic streaming response failed:', error);
    await send({ type: 'error', message: errorMessage(error) });
  } finally {
    if (!cancelled && !res.writableEnded) {
      res.end();
    }
  }
}
