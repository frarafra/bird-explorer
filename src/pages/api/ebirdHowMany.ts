import type { NextApiRequest, NextApiResponse } from 'next';

import { searchObservations } from './ebirdObservations';

const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 300;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAbundanceRange(total: number, maxTotal: number) {
  if (maxTotal <= 0) {
    return { rate: 0, range: { min: 0, max: 0 } };
  }

  if (total <= 0) {
    return { rate: 0, range: { min: 0, max: 0 } };
  }

  const bucketSize = Math.max(1, Math.ceil(maxTotal / 3));

  if (total <= bucketSize) {
    return { rate: 1, range: { min: 1, max: bucketSize } };
  }

  if (total <= bucketSize * 2) {
    return { rate: 2, range: { min: bucketSize + 1, max: bucketSize * 2 } };
  }

  return { rate: 3, range: { min: bucketSize * 2 + 1, max: maxTotal } };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const speciesCodes = Array.isArray(req.query.species)
    ? req.query.species.filter((item): item is string => typeof item === 'string')
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

    const maxTotal = birds.reduce((max, bird) => Math.max(max, bird.total), 0);

    const freqBirds = birds.map((bird) => {
      const abundance = getAbundanceRange(bird.total, maxTotal);

      return {
        ...bird,
        ...abundance,
      };
    });

    res.status(200).json({
      birds: freqBirds,
      abundanceRanges: [
        { rate: 1, range: { min: 1, max: Math.max(1, Math.ceil(maxTotal / 3)) } },
        { rate: 2, range: { min: Math.max(1, Math.ceil(maxTotal / 3) + 1), max: Math.max(1, Math.ceil((maxTotal * 2) / 3)) } },
        { rate: 3, range: { min: Math.max(1, Math.ceil((maxTotal * 2) / 3) + 1), max: maxTotal } },
      ],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
