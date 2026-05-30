import type { NextApiRequest, NextApiResponse } from 'next';
import { getRedisClient } from '../../client/redis';

const redis = getRedisClient();

async function clusterFeatures(
  birds: [string, string][],
  birdImages: Record<string, string>
) {
  const endpoint = process.env.NEXT_PUBLIC_AWS_EBIRD_CLUSTERING_ENDPOINT;

  if (!endpoint) {
    throw new Error('Clustering endpoint is not defined');
  }

  const bird_name_code: [string, string][] = [];
  const bird_code_image_url: [string, string][] = [];

  for (const [name, code] of birds) {
    bird_name_code.push([name, code]);

    bird_code_image_url.push([
      code,
      birdImages[name] || ''
    ]);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bird_name_code,
      bird_code_image_url,
      threshold: 25
    }),
  });

  if (!response.ok) {
    throw new Error(`Clustering Lambda failed: ${await response.text()}`);
  }

  const raw = await response.json();

  const groupedResults =
    typeof raw.body === 'string' ? JSON.parse(raw.body) : raw;

  const finalSortedBirds: [string, string][] = [];
  const processed = new Set<string>();

  const groupKeys = Object.keys(groupedResults).sort();

  for (const key of groupKeys) {
    const group = groupedResults[key];

    if (Array.isArray(group)) {
      for (const bird of group) {
        if (!processed.has(bird.code)) {
          finalSortedBirds.push([bird.name, bird.code]);
          processed.add(bird.code);
        }
      }
    }
  }

  const missing = birds.filter(([, code]) => !processed.has(code));

  return [...finalSortedBirds, ...missing];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const birds = req.body.birds as [string, string][];
    const birdImages = req.body.birdImages as Record<string, string>;

    const cacheKey = `clusters-${JSON.stringify(birds)}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }

    const result = await clusterFeatures(birds, birdImages);

    await redis.set(cacheKey, JSON.stringify(result), 'EX', 600);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Clustering Pipeline Error:', error);

    return res.status(500).json({ error: error.message });
  }
}