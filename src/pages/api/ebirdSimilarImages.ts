import type { NextApiRequest, NextApiResponse } from 'next';
import { getRedisClient } from '../../client/redis';

const redis = getRedisClient();

async function extractFeatures(birds: [string, string][], birdImages: Record<string, string>) {
  const lambdaUrl = process.env.NEXT_PUBLIC_AWS_EBIRD_EXTRACT_FEATURES_ENDPOINT;
  if (!lambdaUrl) {
    throw new Error('Extract Features endpoint is not defined');
  }

  const payload = { birds, birdImages };

  const response = await fetch(lambdaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lambda call failed: ${errorText}`);
  }

  const lambdaResult = await response.json();

  const featuresMap: Record<string, number[]> =
    typeof lambdaResult.body === 'string' ? JSON.parse(lambdaResult.body) : lambdaResult;

  return featuresMap;
}

async function clusterFeatures(
  birds: [string, string][],
  birdImages: Record<string, string>,
  featuresMap: Record<string, number[]>
) {
  const birdNameCodeForLambda: [string, string][] = [];
  const birdCodeImageUrlForLambda: [string, string][] = [];

  birds.forEach(([name, code]) => {
    const lowerName = name.trim().toLowerCase();
    if (featuresMap[lowerName]) {
      birdNameCodeForLambda.push([lowerName, code]);
      birdCodeImageUrlForLambda.push([code, birdImages[name]]);
    }
  });

  const endpoint = process.env.NEXT_PUBLIC_AWS_EBIRD_CLUSTERING_ENDPOINT;
  if (!endpoint) {
    throw new Error('Clustering endpoint is not defined');
  }

  const lambdaResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bird_name_code: birdNameCodeForLambda,
      bird_code_image_url: birdCodeImageUrlForLambda,
      features_map: featuresMap,
    }),
  });

  if (!lambdaResponse.ok) {
    const errorText = await lambdaResponse.text();
    throw new Error(`Lambda failed: ${errorText}`);
  }

  const rawData = await lambdaResponse.json();
  const groupedResults =
    typeof rawData.body === 'string' ? JSON.parse(rawData.body) : rawData;

  const finalSortedBirds: [string, string][] = [];
  const processedCodes = new Set<string>();
  const groupKeys = Object.keys(groupedResults).sort();

  groupKeys.forEach((key) => {
    const group = groupedResults[key];
    if (Array.isArray(group)) {
      group.forEach((bird: { name: string; code: string }) => {
        if (!processedCodes.has(bird.code)) {
          finalSortedBirds.push([bird.name, bird.code]);
          processedCodes.add(bird.code);
        }
      });
    }
  });

  const missingBirds = birds.filter(([, code]) => !processedCodes.has(code));
  return [...finalSortedBirds, ...missingBirds];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const birds = req.body.birds as [string, string][];
    const birdImages = req.body.birdImages as Record<string, string>;

    const cacheKey = `clusters-${JSON.stringify(birds)}`;
    const cachedResult = await redis.get(cacheKey);
    if (cachedResult) {
      res.status(200).json(JSON.parse(cachedResult));
      return;
    }

    const featuresMap = await extractFeatures(birds, birdImages);
    const result = await clusterFeatures(birds, birdImages, featuresMap);

    await redis.set(cacheKey, JSON.stringify(result), 'EX', 10 * 60);

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Clustering Pipeline Error:', error);
    res.status(500).json({ error: error.message });
  }
}