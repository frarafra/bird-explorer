import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import crypto from 'node:crypto';

import { getRedisClient } from '../../client/redis';
import { EBIRD_SPECIES_URL } from '../../components/SearchResults';

const redis = getRedisClient();

const cookieJar = new CookieJar();

const ebirdClient = wrapper(
  axios.create({
    jar: cookieJar,
    withCredentials: true,
    maxRedirects: 0,
    validateStatus: () => true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/153.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  }),
);

interface AnubisChallenge {
  rules: {
    algorithm: string;
    difficulty: number;
  };
  challenge: {
    issuedAt: string;
    metadata: {
      'User-Agent': string;
      'X-Real-Ip'?: string;
    };
    id: string;
    method: string;
    randomData: string;
    policyRuleHash: string;
    difficulty: number;
    spent: boolean;
  };
}

function parseAnubisChallenge(html: string): AnubisChallenge | null {
  const match = html.match(/<script\s+id=["']anubis_challenge["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;

  try {
    return JSON.parse(match[1].trim());
  } catch (error) {
    console.error('Failed to parse Anubis challenge:', error);
    return null;
  }
}

function solveAnubisFast(randomData: string, difficulty: number) {
  const prefix = '0'.repeat(difficulty);
  let nonce = 0;

  while (true) {
    const response = crypto.createHash('sha256').update(randomData + String(nonce)).digest('hex');
    if (response.startsWith(prefix)) return { nonce, response };
    nonce++;
  }
}

async function solveAnubisChallenge(challenge: AnubisChallenge, redirectUrl: string) {
  const { id, randomData, difficulty, method } = challenge.challenge;
  if (method !== 'fast') throw new Error(`Unsupported Anubis challenge method: ${method}`);

  console.log(`Solving Anubis challenge ${id}, difficulty=${difficulty}`);

  const startedAt = Date.now();
  const solved = solveAnubisFast(randomData, difficulty);
  const elapsedTime = Date.now() - startedAt;

  console.log(`Anubis solved: nonce=${solved.nonce}, elapsedTime=${elapsedTime}ms`);

  const challengeUrl = 'https://ebird.org/.within.website/x/cmd/anubis/api/pass-challenge';

  const response = await ebirdClient.get(challengeUrl, {
    params: {
      id,
      response: solved.response,
      nonce: solved.nonce,
      redir: redirectUrl,
      elapsedTime,
    },
  });

  console.log(`Anubis pass-challenge response: ${response.status}`);

  if (![200, 302, 303].includes(response.status)) {
    throw new Error(`Anubis challenge failed: HTTP ${response.status}`);
  }

  return response;
}

const fetchEbirdSpeciesPage = async (initialUrl: string): Promise<string | null> => {
  let url = initialUrl;
  let redirectCount = 0;
  const maxRedirects = 10;
  let challengeAttempts = 0;
  const maxChallengeAttempts = 3;

  try {
    while (redirectCount < maxRedirects) {
      const response = await ebirdClient.get(url);
      console.log(`eBird GET ${url}: ${response.status}`);

      if (response.status === 200) {
        if (typeof response.data === 'string' && response.data.includes('id="anubis_challenge"')) {
          const challenge = parseAnubisChallenge(response.data);
          if (!challenge) throw new Error('Anubis challenge detected but could not be parsed');
          if (challengeAttempts >= maxChallengeAttempts) throw new Error('Maximum Anubis challenge attempts exceeded');

          challengeAttempts++;
          await solveAnubisChallenge(challenge, initialUrl);
          url = initialUrl;
          continue;
        }

        return response.data;
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) throw new Error(`HTTP ${response.status} without Location header`);

        url = new URL(redirectUrl, url).href;
        redirectCount++;
        continue;
      }

      if (typeof response.data === 'string' && response.data.includes('id="anubis_challenge"')) {
        const challenge = parseAnubisChallenge(response.data);
        if (!challenge) throw new Error('Anubis challenge detected but could not be parsed');
        if (challengeAttempts >= maxChallengeAttempts) throw new Error('Maximum Anubis challenge attempts exceeded');

        challengeAttempts++;
        await solveAnubisChallenge(challenge, initialUrl);
        url = initialUrl;
        continue;
      }

      throw new Error(`Unexpected eBird response: HTTP ${response.status}`);
    }

    throw new Error('Too many eBird redirects');
  } catch (error) {
    console.error('Error fetching eBird species page:', error);
    return null;
  }
};

const fetchImageUrl = async (speciesCode: string): Promise<string | null> => {
  const cacheKey = `${speciesCode}-img`;
  const cachedImageUrl = await redis.get(cacheKey);
  if (cachedImageUrl) return JSON.parse(cachedImageUrl);

  try {
    const html = await fetchEbirdSpeciesPage(`${EBIRD_SPECIES_URL}${speciesCode}`);
    if (!html) {
      console.warn(`No HTML returned for species code: ${speciesCode}`);
      return null;
    }

    const $ = cheerio.load(html);
    const imageElement = $('.Species-media-image');

    if (imageElement.length === 0) {
      console.warn(`No image found for species code: ${speciesCode}`);
      return null;
    }

    const imageUrl = imageElement.attr('src') || null;
    if (!imageUrl) return null;

    await redis.set(cacheKey, JSON.stringify(imageUrl), 'EX', 30 * 24 * 60 * 60);
    return imageUrl;
  } catch (error) {
    console.error(`Error fetching image for species code ${speciesCode}:`, error);
    return null;
  }
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchImagesInBatches = async (
  birds: Record<string, string>,
  batchSize: number,
  delayMs: number,
): Promise<Array<{ name: string; imageUrl: string }>> => {
  const birdEntries = Object.entries(birds);
  let results: Array<{ name: string; imageUrl: string }> = [];

  for (let i = 0; i < birdEntries.length; i += batchSize) {
    const batch = birdEntries.slice(i, i + batchSize);

    console.log(`Processing batch ${Math.floor(i / batchSize) + 1} / ${Math.ceil(birdEntries.length / batchSize)}`);

    const dataPromises = batch.map(async ([name, speciesCode]) => {
      const imageUrl = await fetchImageUrl(speciesCode);
      return { name, imageUrl };
    });

    const resultsBatch = await Promise.allSettled(dataPromises);

    const successfulResults = resultsBatch
      .filter(
        (result): result is PromiseFulfilledResult<{ name: string; imageUrl: string | null }> =>
          result.status === 'fulfilled',
      )
      .filter((result) => result.value.imageUrl !== null)
      .map((result) => ({ name: result.value.name, imageUrl: result.value.imageUrl as string }));

    results = results.concat(successfulResults);

    if (i + batchSize < birdEntries.length) await delay(delayMs);
  }

  return results;
};

export async function getBirdImages(
  birds: Record<string, string>,
) {
  const entries = Object.entries(birds);

  const keys = entries.map(
    ([, speciesCode]) => `${speciesCode}-img`,
  );

  const cachedValues = await redis.mget(keys);

  const results: Array<{ name: string; imageUrl: string }> = [];
  const missing: Array<[string, string]> = [];

  entries.forEach(([name, speciesCode], index) => {
    const cached = cachedValues[index];

    if (cached) {
      results.push({
        name,
        imageUrl: JSON.parse(cached),
      });
    } else {
      missing.push([name, speciesCode]);
    }
  });

  console.log(
    `Redis: ${results.length} hits, ${missing.length} misses`,
  );

  if (missing.length > 0) {
    const missingBirds = Object.fromEntries(missing);

    const fetched = await fetchImagesInBatches(
      missingBirds,
      2,
      1000,
    );

    results.push(...fetched);
  }

  return results;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const successfulResults = await getBirdImages(req.body);
    //console.log('Fetched image results:', successfulResults);

    return res.status(200).json(successfulResults);
  } catch (error) {
    console.error('Error in /api/ebirdImages:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

