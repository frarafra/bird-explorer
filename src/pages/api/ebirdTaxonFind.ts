import type { NextApiRequest, NextApiResponse } from 'next';

const EBIRD_API_TAXON_FIND = 'https://api.ebird.org/v2/ref/taxonomy/ebird';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { bird } = req.query;

  if (!bird) {
    return res.status(400).json({ error: 'Missing search text parameter' });
  }

  let taxons: Record<string, string>[] | undefined = [];
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_AWS_EBIRD_ENDPOINT}?query=${bird}`);
    if (!response.ok) {
      throw new Error('Failed to fetch taxon data from AWS endpoint');
    }

    const data = await response.json();
    taxons = data.results?.map((result: { common_name: string; species_code: string; }) => ({ name: result.common_name, code: result.species_code }));

    if (taxons?.length === 0 && bird.length > 3) {
      const response = await fetch(`${EBIRD_API_TAXON_FIND}?cat=species&fmt=json&key=${process.env.NEXT_PUBLIC_EBIRD_API_TAXON_FIND_TOKEN}&q=${bird}&count=150`);
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
