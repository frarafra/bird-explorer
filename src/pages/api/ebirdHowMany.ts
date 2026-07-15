import type { NextApiRequest, NextApiResponse } from 'next';

import { searchObservations } from './ebirdObservations';

const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 300;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const speciesParam = req.query.species;
  const speciesCodes = typeof speciesParam === 'string'
    ? speciesParam.split(',').map(s => s.trim()).filter(Boolean)
    : Array.isArray(speciesParam)
      ? speciesParam.filter((item): item is string => typeof item === 'string')
      : [];

  if (speciesCodes.length === 0) {
    return res.status(400).json({ error: 'Missing bird species codes' });
  }

  const lat = Number(req.query.lat ?? process.env.NEXT_PUBLIC_LAT ?? 0);
  const lng = Number(req.query.lng ?? process.env.NEXT_PUBLIC_LNG ?? 0);

  try {
    const allResults: Array<PromiseSettledResult<unknown>> = [];

    for (let index = 0; index < speciesCodes.length; index += BATCH_SIZE) {
      const batch = speciesCodes.slice(index, index + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((speciesCode: string) =>
          searchObservations({
            bird: speciesCode,
            lat,
            lng,
          })
        )
      );

      allResults.push(...batchResults);

      if (index + BATCH_SIZE < speciesCodes.length) {
        await delay(BATCH_DELAY_MS);
      }
    }

    const birds = allResults.map((result, index) => {
      const speciesCode = speciesCodes[index];

      if (result.status === 'rejected') {
        return {
          speciesCode,
          total: 0,
          rate: 0,
          range: { min: 0, max: 0 },
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        };
      }

      const observations = Array.isArray(result.value) ? result.value : [];
      const total = observations.reduce((sum, observation) => {
        const rawHowMany = observation?.howMany;
        const parsedHowMany =
          typeof rawHowMany === 'number'
            ? rawHowMany
            : typeof rawHowMany === 'string'
              ? Number(rawHowMany)
              : 1;

        const howMany = Number.isFinite(parsedHowMany) && parsedHowMany > 0 ? parsedHowMany : 1;

        return sum + howMany;
      }, 0);

      return {
        speciesCode,
        total,
      };
    });

    const freqBirds = birds.map((bird) => {
      const abundance = getAbundanceRange(bird.total);

      return {
        ...bird,
        ...abundance,
      };
    });

    res.status(200).json({
      birds: freqBirds,
      abundanceRanges: [
        { rate: 1, range: { min: 1, max: 20 } },
        { rate: 2, range: { min: 21, max: 100 } },
        { rate: 3, range: { min: 101, max: 500 } },
        { rate: 4, range: { min: 501, max: Infinity } },
      ],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
