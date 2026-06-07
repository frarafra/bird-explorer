import type { NextApiRequest, NextApiResponse } from 'next';
import { getRedisClient } from '../../client/redis';

const redis = getRedisClient();

type RecordingLike = { q?: string; type?: string };

const isHighQualitySong = <T extends RecordingLike>(rec: T | null | undefined): rec is T & { q: 'A'; type: 'song' } => {
    return !!rec && rec.q === 'A' && rec.type === 'song';
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

        const filtered = recs.filter(isHighQualitySong);
        if (filtered.length > 0) {
            if (redis) await redis.set(cacheKey, JSON.stringify(filtered), 'EX', 600);
            return filtered;
        }

        const altQuery = `en:"=${encodeURIComponent(name)}"`;
        recs = await makeRequest(encodeURIComponent(altQuery));
        const filteredAlt = recs.filter(isHighQualitySong);
        if (filteredAlt.length > 0) {
            if (redis) await redis.set(cacheKey, JSON.stringify(filteredAlt), 'EX', 600);
            return filteredAlt;
        }

        try {
            const EBIRD_TAXONOMY_API_URL = 'https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&version=2019&species=';
            const response = await fetch(`${EBIRD_TAXONOMY_API_URL}${code}`);
            if (response.ok) {
                const birdTaxon = await response.json();
                const sci = birdTaxon?.[0]?.sciName;
                if (sci) {
                    const speciesQuery = encodeURIComponent(`sp:"${sci}"`);
                    recs = await makeRequest(speciesQuery);
                    const filteredSpecies = recs.filter(isHighQualitySong);
                    if (filteredSpecies.length > 0) {
                        if (redis) await redis.set(cacheKey, JSON.stringify(filteredSpecies), 'EX', 600);
                        return filteredSpecies;
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const queries = req.body;
        const out: Record<string, any[]> = {};

        await Promise.all(
            queries.map(async (q: { name: string, code: string, lat?: number, lon?: number }) => {
                try {
                    const xr = await fetchXenoRecordings(q.name, q.code, q.lat ?? 0, q.lon ?? 0, 1);
                    const recs = Array.isArray(xr) ? xr : [];
                    out[q.name] = recs;
                } catch (e) {
                    out[q.name] = [];
                }
            })
        );

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).json({ results: out });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
