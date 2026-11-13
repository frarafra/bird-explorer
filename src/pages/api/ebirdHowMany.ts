import type { NextApiRequest, NextApiResponse } from 'next';

import { searchObservations } from './ebirdObservations';
import { getRedisClient } from '../../client/redis';

type BirdResult = {
  speciesCode: string;
  total: number;
  rate: number;
  range: { min: number; max: number };
  error?: string;
};

type StreamMessage =
  | { type: 'bird'; bird: BirdResult }
  | { type: 'complete' }
  | { type: 'error'; message: string };

function getAbundanceRange(total: number) {
  if (total <= 0) {
    return {
      rate: 0,
      range: { min: 0, max: 0 },
    };
  }

  if (total <= 200) {
    return { rate: 1, range: { min: 1, max: 200 } };
  }

  if (total <= 1000) {
    return { rate: 2, range: { min: 201, max: 1000 } };
  }

  if (total <= 5000) {
    return { rate: 3, range: { min: 1001, max: 5000 } };
  }

  return { rate: 4, range: { min: 5001, max: Infinity } };
}

function getSpeciesCodes(speciesParam: string | string[] | undefined) {
  if (typeof speciesParam === 'string') {
    return speciesParam.split(',').map((species) => species.trim()).filter(Boolean);
  }

  return Array.isArray(speciesParam)
    ? speciesParam.filter((species): species is string => typeof species === 'string')
    : [];
}

function getTotal(observations: unknown) {
  if (!Array.isArray(observations)) {
    return 0;
  }

  return observations.reduce<number>((sum, observation) => {
    const rawHowMany =
      observation && typeof observation === 'object' && 'howMany' in observation
        ? observation.howMany
        : undefined;
    const parsedHowMany =
      typeof rawHowMany === 'number'
        ? rawHowMany
        : typeof rawHowMany === 'string'
          ? Number(rawHowMany)
          : 1;
    const howMany =
      Number.isFinite(parsedHowMany) && parsedHowMany > 0 ? parsedHowMany : 1;

    return sum + howMany;
  }, 0);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const speciesParam = req.query.species;
  const speciesCodes = getSpeciesCodes(speciesParam);

  if (speciesCodes.length === 0) {
    return res.status(400).json({ error: 'Missing bird species codes' });
  }

  const lat = Number(req.query.lat ?? process.env.NEXT_PUBLIC_LAT ?? 0);
  const lng = Number(req.query.lng ?? process.env.NEXT_PUBLIC_LNG ?? 0);
  const cacheKey = `ebirdHowMany:${Array.isArray(speciesParam) ? speciesParam.join(',') : String(speciesParam)}:${lat}:${lng}`;
  const redis = getRedisClient();

  let cachedPayload: { birds: BirdResult[] } | null;
  try {
    const cachedData = await redis.get(cacheKey);
    cachedPayload = cachedData ? JSON.parse(cachedData) : null;
  } catch (error) {
    console.error('Failed to read eBird abundance cache:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }

  let cancelled = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      cancelled = true;
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

  try {
    const birds: BirdResult[] = [];

    if (cachedPayload) {
      for (const bird of cachedPayload.birds) {
        if (cancelled) {
          break;
        }
        birds.push(bird);
        await send({ type: 'bird', bird });
      }
    } else {
      for (const speciesCode of speciesCodes) {
        if (cancelled) {
          break;
        }

        let bird: BirdResult;
        try {
          const observations = await searchObservations({ bird: speciesCode, lat, lng });
          const total = getTotal(observations);
          bird = {
            speciesCode,
            total,
            ...getAbundanceRange(total),
          };
        } catch (error) {
          bird = {
            speciesCode,
            total: 0,
            ...getAbundanceRange(0),
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }

        birds.push(bird);
        await send({ type: 'bird', bird });
      }

      if (!cancelled) {
        const payload = { birds };
        try {
          await redis.set(cacheKey, JSON.stringify(payload), 'EX', 600);
        } catch (error) {
          console.error('Failed to cache eBird abundance results:', error);
          throw error;
        }
      }
    }

    if (!cancelled) {
      await send({ type: 'complete' });
    }
  } catch (error) {
    console.error('eBird abundance streaming response failed:', error);
    await send({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    if (!cancelled && !res.writableEnded) {
      res.end();
    }
  }
}
