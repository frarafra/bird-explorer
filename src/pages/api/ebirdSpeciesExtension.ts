import type { NextApiRequest, NextApiResponse } from 'next';

const EBIRD_API_MAP_RSID = 'https://ebird.org/map/rsid';
const EBIRD_API_MAP_EXT = 'https://ebird.org/map/env';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { bird } = req.query;

  if (!bird) {
    return res.status(400).json({ error: 'Missing specie parameter' });
  }

  try {
    const response = await fetch(`${EBIRD_API_MAP_RSID}?speciesCode=${bird}&gridScale=100`);

    if (!response.ok) {
      throw new Error('Failed to fetch rsid from eBird API');
    }

    const rsid = await response.text();

    const extResponse = await fetch(`${EBIRD_API_MAP_EXT}?speciesCode=${bird}&rsid=${rsid}`);

    if (!extResponse.ok) {
      throw new Error('Failed to fetch extension data from eBird API');
    }

    const data = await extResponse.json();

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
