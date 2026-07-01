import type { NextApiRequest, NextApiResponse } from 'next';
import { getRedisClient } from '../../client/redis';

const redis = getRedisClient();

type Recording = { q?: string; type?: string };

const isHighQualityCall = <T extends Recording>(rec: T | null | undefined): rec is T & { q: 'A'; type: 'call' } => {
    return !!rec && rec.q === 'A' && rec.type === 'call';
};

const filterHighQualitySongs = (recs: Recording[]) => {
    const songsA: Recording[] = [];
    const songsB: Recording[] = [];
    for (const r of recs) {
        if (r && r.type === 'song' && r.q === 'A') {
            songsA.push(r);
        } else if (r && r.type === 'song' && r.q === 'B') {
            songsB.push(r);
        }
    }
    if (songsA.length > 0) return songsA;
    if (songsB.length > 0) return songsB;
    return [];
};

const fetchXenoRecordings = async (
    name: string,
    code: string,
    lat: number,
    lng: number,
    page = 1
) => {
    const key = process.env.NEXT_PUBLIC_XENO_KEY || process.env.XENO_API_KEY || process.env.XENO_KEY || null;
    const cacheKey = `xeno:${encodeURIComponent(name)}:${encodeURIComponent(code)}:${lat}:${lng}:p${page}`;

    try {
        if (redis) {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }

        const uaHeaders = { 'User-Agent': 'ebird-songbook/1.0' };

        const makeRequest = async (query: string) => {
            const url = `https://xeno-canto.org/api/3/recordings?query=${query}&page=${page}${key ? `&key=${encodeURIComponent(key)}` : ''}`;
            console.debug(`fetchXenoRecordings: requesting URL: ${url}`);
            const res = await fetch(url, { headers: uaHeaders });
            if (!res.ok) {
                throw new Error(`xeno returned ${res.status}`);
            }
            const d = await res.json();
            return d?.recordings ?? [];
        };

        const primaryQuery = encodeURIComponent(`lat:${lat} lon:${lng} en:"${name}"`);
        let recs = await makeRequest(primaryQuery);

        const preferred = filterHighQualitySongs(recs);
        if (preferred.length > 0) {
            if (redis) await redis.set(cacheKey, JSON.stringify(preferred), 'EX', 600);
            return preferred;
        }

        const altQuery = `en:"=${name.replace(/ /g, '%20')}"`;
        recs = await makeRequest(altQuery);
        const preferredAlt = filterHighQualitySongs(recs);
        if (preferredAlt.length > 0) {
            if (redis) await redis.set(cacheKey, JSON.stringify(preferredAlt), 'EX', 600);
            return preferredAlt;
        }

        try {
            const EBIRD_TAXONOMY_API_URL = 'https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&version=2019&species=';
            const response = await fetch(`${EBIRD_TAXONOMY_API_URL}${code}`);
                if (response.ok) {
                const birdTaxon = await response.json();
                let sci = birdTaxon?.[0]?.sciName;
                if (sci) {
                    const parts = sci.trim().split(/\s+/);
                    if (parts.length === 3) {
                        sci = parts.slice(0, 2).join(' ');
                    }
                    const speciesQuery = encodeURIComponent(`sp:"${sci}"`);
                    recs = await makeRequest(speciesQuery);
                    const preferredSpecies = filterHighQualitySongs(recs);
                    if (preferredSpecies.length > 0) {
                        if (redis) await redis.set(cacheKey, JSON.stringify(preferredSpecies), 'EX', 600);
                        return preferredSpecies;
                    }

                    const filteredSpeciesCalls = recs.filter(isHighQualityCall);
                    if (filteredSpeciesCalls.length > 0) {
                        if (redis) await redis.set(cacheKey, JSON.stringify(filteredSpeciesCalls), 'EX', 600);
                        return filteredSpeciesCalls;
                    }
                }
            }
        } catch (e) {
            console.warn('fetchXenoRecordings: taxonomy lookup failed', e);
        }

        if (redis) await redis.set(cacheKey, JSON.stringify([]), 'EX', 600);
        return [];
    } catch (e) {
        console.warn(`fetchXenoRecordings: request failed for query "${name}"`, e);
        return [];
    }
};

export type RecordingQuery = {
  name: string;
  code: string;
  lat?: number;
  lon?: number;
};

export async function getXenoRecordings(queries: RecordingQuery[]) {
  const out: Record<string, any[]> = {};

  await Promise.all(
    queries.map(async (q) => {
      try {
        const xr = await fetchXenoRecordings(
          q.name,
          q.code,
          q.lat ?? 0,
          q.lon ?? 0,
          1
        );

        out[q.name] = Array.isArray(xr) ? xr : [];
      } catch {
        out[q.name] = [];
      }
    })
  );

  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const results = await getXenoRecordings(req.body);

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).json({ results });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
