import type { NextApiRequest, NextApiResponse } from 'next';

const EBIRD_API_TAXON_FIND = 'https://api.ebird.org/v2/ref/taxon/find';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { bird } = req.query;

  if (!bird) {
    return res.status(400).json({ error: 'Missing search text parameter' });
  }

  try {
    const response = await fetch(`${EBIRD_API_TAXON_FIND}?cat=species&key=${process.env.NEXT_PUBLIC_EBIRD_API_TAXON_FIND_TOKEN}&q=${bird}&count=150`);
    if (!response.ok) {
      throw new Error('Failed to fetch taxon data from eBird API');
    }

    const taxons = await response.json();

    res.status(200).json(taxons);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
