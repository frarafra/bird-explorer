import type { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { getRedisClient } from '../../client/redis';

type BirdData = Record<string, any>;

type ResponseData = {
    birds?: BirdData[];
    keywordsMap?: Record<string, string[]>;
    birdKeywords?: Record<string, string[]>;
    error?: string;
};

const redis = getRedisClient();

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'ebird_taxonomy';
const BATCH_SIZE = 100;

const capitalizeName = (name: string): string =>
    name
        .toLowerCase()
        .split(' ')
        .map((word, wordIndex) =>
            word
                .split('-')
                .map((part, partIndex) =>
                    wordIndex === 0 && partIndex > 0
                        ? part
                        : part.charAt(0).toUpperCase() + part.slice(1)
                )
                .join('-')
        )
        .join(' ');

const safeArray = (val: any): string[] => {
    if (Array.isArray(val)) return val.filter(v => typeof v === 'string');
    if (val instanceof Set) return Array.from(val).filter(v => typeof v === 'string');
    if (typeof val === 'string') return [val];
    return [];
};

const normalizeBirdData = (bird: Record<string, any>): BirdData => ({
    ...bird,
    _keywords_behavior: safeArray(bird._keywords_behavior),
    _keywords_habitat: safeArray(bird._keywords_habitat),
    _keywords_vocalisation: safeArray(bird._keywords_vocalisation),
});

const chunkArray = <T,>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    );

const batchGetItems = async (names: string[]): Promise<BirdData[]> => {
    const command = new BatchGetCommand({
        RequestItems: {
            [TABLE_NAME]: {
                Keys: names.map(n => ({ common_name: capitalizeName(n) }))
            }
        }
    });

    const res = await docClient.send(command);
    return (res.Responses?.[TABLE_NAME] || []).map(normalizeBirdData);
};

const batchGetItemsParallel = async (names: string[]) =>
    (await Promise.all(chunkArray(names, BATCH_SIZE).map(batchGetItems))).flat();

const isBiologicalNoise = (k: string) => {
    const p = process.env.NEXT_PUBLIC_BIOLOGICAL_NOISE_PATTERN!;
    return new RegExp(p, 'i').test(k);
};

const isTaxonomicGroup = (k: string) => {
    const p = process.env.NEXT_PUBLIC_TAXONOMIC_GROUP_PATTERN!;
    return new RegExp(p, 'i').test(k);
};

const isGenericTerm = (k: string) => {
    const p = process.env.NEXT_PUBLIC_GENERIC_TERM_PATTERN!;
    return new RegExp(p, 'i').test(k);
};

const extractKeywordFromPhrase = (k: string): string | null => {
    const cleaned = k
        .replace(/^(its|the|a|an|their)\s+/i, '')
        .trim();

    return cleaned.length >= 3 ? cleaned : null;
};

const normalizeKeywordsMap = (map: Record<string, string[]>) => {
    const out: Record<string, string[]> = {};

    for (const [cat, keywords] of Object.entries(map)) {
        const allKeywords = new Set(
            keywords
                .filter(k => typeof k === 'string')
                .map(k => k.toLowerCase().trim())
                .map(k => extractKeywordFromPhrase(k) || k)
                .filter(k => k.length > 0)
                .filter(
                    k =>
                        !isBiologicalNoise(k) &&
                        !isTaxonomicGroup(k) &&
                        !isGenericTerm(k)
                )
        );

        const processed = Array.from(
            new Set(
                [...allKeywords].map(kw => {
                    if (kw.endsWith('s') && allKeywords.has(kw.slice(0, -1))) {
                        return kw;
                    }
                    if (allKeywords.has(kw + 's')) {
                        return kw + 's';
                    }
                    return kw;
                })
            )
        );

        if (processed.length) {
            out[cat] = processed.sort();
        }
    }

    return out;
};

const createRawToNormalizedMapping = (
    birds: BirdData[],
    map: Record<string, string[]>
) => {
    const out: Record<string, Record<string, string[]>> = {};

    for (const [cat, keywords] of Object.entries(map)) {
        out[cat] = {};

        const rawKey = `_keywords_${cat.toLowerCase().replace(/\s+/g, '_')}`;

        for (const kw of keywords) {
            const normKw = kw.toLowerCase().trim();

            for (const bird of birds) {
                for (const raw of safeArray(bird[rawKey])) {
                    const normRaw = raw.toLowerCase().trim();
                    if (
                        normRaw === normKw ||
                        normRaw === normKw.slice(0, -1) ||
                        (normRaw + 's') === normKw
                    ) {
                        if (!out[cat][kw]) out[cat][kw] = [];
                        if (!out[cat][kw].includes(raw)) {
                            out[cat][kw].push(raw);
                        }
                    }
                }
            }
        }
    }

    return out;
};

const mapBirdsToNormalizedKeywords = (
    names: string[],
    birds: BirdData[],
    map: Record<string, string[]>,
    mapping: Record<string, Record<string, string[]>>
) => {
    const out: Record<string, string[]> = {};
    const nameMap: Record<string, string> = {};

    names.forEach(n => (nameMap[capitalizeName(n)] = n));

    for (const bird of birds) {
        const original = nameMap[bird.common_name] || bird.common_name;
        const keywords: string[] = [];

        for (const [cat, kws] of Object.entries(map)) {
            const rawKey = `_keywords_${cat.toLowerCase().replace(/\s+/g, '_')}`;
            const rawList = safeArray(bird[rawKey]);

            for (const kw of kws) {
                const normKw = kw.toLowerCase().trim();

                const hasMatch = rawList.some(raw => {
                    const normRaw = raw.toLowerCase().trim();
                    return (
                        normRaw === normKw ||
                        normRaw === normKw.slice(0, -1) ||
                        (normRaw + 's') === normKw
                    );
                });

                if (hasMatch) {
                    keywords.push(`${cat}:${kw}`);
                }
            }
        }

        if (keywords.length) out[original] = keywords;
    }

    return out;
};

function filterSharedKeywords(
    birdKeywords: Record<string, string[]>,
    minCount: number = 2
) {
    const counts: Record<string, number> = {};

    for (const keywords of Object.values(birdKeywords)) {
        const unique = new Set(keywords);
        unique.forEach(k => {
            counts[k] = (counts[k] || 0) + 1;
        });
    }

    const allowed = new Set(
        Object.entries(counts)
            .filter(([_, c]) => c >= minCount)
            .map(([k]) => k)
    );

    const filteredBirdKeywords: Record<string, string[]> = {};

    for (const [bird, keywords] of Object.entries(birdKeywords)) {
        const filtered = keywords.filter(k => allowed.has(k));
        if (filtered.length) filteredBirdKeywords[bird] = filtered;
    }

    return {
        filteredBirdKeywords,
        allowedKeywords: allowed
    };
}

const removeSemanticDuplicates = (keywords: string[]): string[] => {
    const sorted = [...keywords].sort((a, b) => b.length - a.length);

    return sorted.filter((k, i, arr) =>
        !arr.some((o, j) => {
            if (i === j || o.length <= k.length) return false;

            const aWords = new Set(k.split(/\s+/));
            const bWords = new Set(o.split(/\s+/));

            return [...aWords].every(w => bWords.has(w));
        })
    );
};

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<ResponseData>
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { commonNames, cache } = req.body;

        if (!Array.isArray(commonNames)) {
            return res.status(400).json({ error: 'commonNames must be array' });
        }

        if (cache && redis) {
            try {
                const key = `tags:${JSON.stringify([...commonNames].sort())}`;
                const raw = await redis.get(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    return res.status(200).json(parsed);
                }
            } catch (err) {
                console.warn('getBirdsTags: redis get failed', err);
            }
        }

        const birds = await batchGetItemsParallel(commonNames);

        const rawKeywordsMap: Record<string, string[]> = {};

        for (const bird of birds) {
            for (const [k, v] of Object.entries(bird)) {
                if (!k.startsWith('_keywords_')) continue;

                const cat = k.replace('_keywords_', '').replace(/_/g, ' ');
                const cap = cat.charAt(0).toUpperCase() + cat.slice(1);

                rawKeywordsMap[cap] ||= [];
                safeArray(v).forEach(val => rawKeywordsMap[cap].push(val));
            }
        }

        const normalizedKeywordsMap = normalizeKeywordsMap(rawKeywordsMap);
        const mapping = createRawToNormalizedMapping(birds, normalizedKeywordsMap);

        const birdKeywordsRaw = mapBirdsToNormalizedKeywords(
            commonNames,
            birds,
            normalizedKeywordsMap,
            mapping
        );

        const { filteredBirdKeywords, allowedKeywords } =
            filterSharedKeywords(birdKeywordsRaw, 2);

        const filteredKeywordsMap: Record<string, string[]> = {};

        for (const [category, keywords] of Object.entries(normalizedKeywordsMap)) {
            const filtered = keywords.filter(k =>
                allowedKeywords.has(`${category}:${k}`)
            );

            if (filtered.length) {
                filteredKeywordsMap[category] =
                    removeSemanticDuplicates(filtered).sort();
            }
        }

        res.setHeader('Cache-Control', 'private, max-age=3600');

        const responsePayload = {
            keywordsMap: filteredKeywordsMap,
            birdKeywords: filteredBirdKeywords
        };

        if (cache && redis) {
            try {
                const key = `tags:${JSON.stringify([...commonNames].sort())}`;
                await redis.set(key, JSON.stringify(responsePayload), 'EX', 30 * 24 * 60 * 60);
            } catch (err) {
                console.warn('getBirdsTags: redis set failed', err);
            }
        }

        return res.status(200).json(responsePayload);

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}