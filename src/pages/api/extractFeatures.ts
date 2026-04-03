import type { NextApiRequest, NextApiResponse } from 'next';
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const birds = req.body.birds as [string, string][]; 
    const birdImages = req.body.birdImages as Record<string, string>;
    const payload = {
      birds,
      birdImages
    };
    const command = new InvokeCommand({
      FunctionName: "bird-images-features",
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const client = new LambdaClient({ region: "eu-west-1" });
    const response = await client.send(command);
    const lambdaResult = JSON.parse(
      new TextDecoder().decode(response.Payload)
    );

    const featuresMap: Record<string, number[]> = JSON.parse(lambdaResult.body);

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
        features_map: featuresMap
      }),
    });

    if (!lambdaResponse.ok) {
      const errorText = await lambdaResponse.text();
      throw new Error(`Lambda failed: ${errorText}`);
    }

    const rawData = await lambdaResponse.json();
    const groupedResults = typeof rawData.body === 'string' 
      ? JSON.parse(rawData.body) 
      : rawData;

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

    const missingBirds = birds.filter(([, code]: [string, string]) => !processedCodes.has(code));
    const result = [...finalSortedBirds, ...missingBirds];

    res.status(200).json(result);

  } catch (error: any) {
    console.error('Clustering Pipeline Error:', error);
    res.status(500).json({ error: error.message });
  }
}