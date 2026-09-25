import type { NextApiRequest, NextApiResponse } from 'next';

import { getRedisClient } from '../../../client/redis';

const redis = getRedisClient();

const EBIRD_TAXONOMY_API_URL = 'https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&species=';

async function ebirdTaxonomySearch(speciesCodes: string[]) {
    const uniqueSpeciesCodes = [...new Set(speciesCodes)];

    const cacheKeys = uniqueSpeciesCodes.map(
        (speciesCode) => `${speciesCode}-family`
    );

    const cachedFamilies = await redis.mget(cacheKeys);

    const taxonomies: Record<string, string> = {};
    const missingSpeciesCodes: string[] = [];

    uniqueSpeciesCodes.forEach((speciesCode, index) => {
        const cachedFamily = cachedFamilies[index];

        if (cachedFamily) {
            taxonomies[speciesCode] = JSON.parse(cachedFamily);
        } else {
            missingSpeciesCodes.push(speciesCode);
        }
    });

    const fetchResults = await Promise.allSettled(
        missingSpeciesCodes.map(async (speciesCode) => {
            const response = await fetch(
                `${EBIRD_TAXONOMY_API_URL}${speciesCode}`
            );

            if (!response.ok) {
                throw new Error(
                    `eBird API returned ${response.status} for ${speciesCode}`
                );
            }

            const birdTaxon = await response.json();
            const birdFamily = birdTaxon?.[0]?.familyComName;

            if (!birdFamily) {
                throw new Error(
                    `No family found for species code ${speciesCode}`
                );
            }

            return {
                speciesCode,
                birdFamily,
            };
        })
    );

    await Promise.all(
        fetchResults.map(async (result) => {
            if (result.status !== 'fulfilled') {
                console.error(
                    'Failed to fetch taxonomy:',
                    result.reason
                );
                return;
            }

            const { speciesCode, birdFamily } = result.value;

            taxonomies[speciesCode] = birdFamily;

            await redis.set(
                `${speciesCode}-family`,
                JSON.stringify(birdFamily),
                'EX',
                30 * 24 * 60 * 60
            );
        })
    );

    return taxonomies;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { speciesCodes } = req.query;

    if (!speciesCodes || Array.isArray(speciesCodes)) {
      throw new Error('Invalid speciesCodes provided');
    }

    const taxonomies = await ebirdTaxonomySearch(speciesCodes.split(','));
    res.status(200).json(taxonomies);
  } catch (error) {
    console.error('Error in /api/taxonomy/species:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
