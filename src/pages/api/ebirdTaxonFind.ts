import type { NextApiRequest, NextApiResponse } from 'next';

import { getTypesenseClient } from '../../client/typesense';

const EBIRD_API_TAXON_FIND = 'https://api.ebird.org/v2/ref/taxon/find';

const typesenseClient = getTypesenseClient();

interface EBirdTaxonomy {
  primary_com_name: string;
  sci_name: string;
  order: string;
  family: string;
  taxon_order: number;
  species_code: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { bird } = req.query;

  if (!bird) {
    return res.status(400).json({ error: 'Missing search text parameter' });
  }

  let taxons: Record<string, string>[] | undefined = [];
  try {
    const results = await typesenseClient.collections<EBirdTaxonomy>('ebird_taxonomy')
      .documents()
      .search({
        q: bird as string,
        query_by: 'primary_com_name',
        per_page: 150,
        facet_by: 'order,family',
      });

    taxons = results?.hits?.map(hit => ({ name: hit.document?.primary_com_name, code: hit.document?.species_code }));

    if (taxons?.length === 0) {
      const response = await fetch(`${EBIRD_API_TAXON_FIND}?cat=species&key=${process.env.NEXT_PUBLIC_EBIRD_API_TAXON_FIND_TOKEN}&q=${bird}&count=150`);
      if (!response.ok) {
        throw new Error('Failed to fetch taxon data from eBird API');
      }

      taxons = await response.json();
    }

    res.status(200).json(taxons);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
