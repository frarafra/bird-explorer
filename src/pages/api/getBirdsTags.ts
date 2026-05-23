import type { NextApiRequest, NextApiResponse } from 'next';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

type BirdData = Record<string, any>;

type ResponseData = {
    birds?: BirdData[];
    keywordsMap?: Record<string, string[]>;
    birdKeywords?: Record<string, string[]>;
    error?: string;
};

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = 'ebird_taxonomy';
const BATCH_SIZE = 100;

const capitalizeName = (name: string): string =>
    name.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
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

const isBiologicalNoise = (k: string) => {
    const biologicalNoisePattern = process.env.NEXT_PUBLIC_BIOLOGICAL_NOISE_PATTERN;
    if (!biologicalNoisePattern) {
        throw new Error('Environment variable NEXT_PUBLIC_BIOLOGICAL_NOISE_PATTERN is not set');
    }
    return new RegExp(biologicalNoisePattern, 'i').test(k);
};

const isTaxonomicGroup = (k: string) => {
    const taxonomicGroupPattern = process.env.NEXT_PUBLIC_TAXONOMIC_GROUP_PATTERN;
    if (!taxonomicGroupPattern) {
        throw new Error('Environment variable NEXT_PUBLIC_TAXONOMIC_GROUP_PATTERN is not set');
    }
    return new RegExp(taxonomicGroupPattern, 'i').test(k);
};

const isGenericTerm = (k: string) => {
    const genericTermPattern = process.env.NEXT_PUBLIC_GENERIC_TERM_PATTERN;
    if (!genericTermPattern) {
        throw new Error('Environment variable NEXT_PUBLIC_GENERIC_TERM_PATTERN is not set');
    }
    return new RegExp(genericTermPattern, 'i').test(k);
};

const extractKeywordFromPhrase = (k: string): string | null => {
    const cleaned = k
        .replace(/^(its|the|a|an|their)\s+/i, '')
        .trim();

    return cleaned.length >= 3 ? cleaned : null;
};

const removeSemanticDuplicates = (keywords: string[]): string[] => {
    const sorted = [...keywords].sort((a, b) => b.length - a.length);
    return sorted.filter((k, i, arr) =>
        !arr.some((o, j) =>
            i !== j &&
            k.split(' ').every(w => o.includes(w)) &&
            o.length > k.length
        )
    );
};

const normalizeKeywordsMap = (map: Record<string, string[]>) => {
    const out: Record<string, string[]> = {};

    for (const [cat, keywords] of Object.entries(map)) {
        let processed = Array.from(new Set(
            keywords
                .filter(k => typeof k === 'string')
                .map(k => k.toLowerCase().trim())
                .map(k => extractKeywordFromPhrase(k) || k)
                .filter(k => k.length > 0)
                .filter(k => !isBiologicalNoise(k) && !isTaxonomicGroup(k) && !isGenericTerm(k))
        ));

        processed = removeSemanticDuplicates(processed);

        if (processed.length) out[cat] = processed.sort();
    }

    return out;
};

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

const normalizeForSynonym = (text: string): string => {
    let t = text.toLowerCase().trim();
    t = t.replace(/^(its|the|a|an|their)\s+/i, '');
    t = t.replace(/(\w+)ies\b/g, '$1y');
    t = t.replace(/(\w+)s\b/g, '$1');
    return t;
};

const createRawToNormalizedMapping = (birds: BirdData[], map: Record<string, string[]>) => {
    const out: Record<string, Record<string, string[]>> = {};

    for (const [cat, keywords] of Object.entries(map)) {
        out[cat] = {};

        for (const kw of keywords) {
            const rawKey = `_keywords_${cat.toLowerCase().replace(/\s+/g, '_')}`;
            const normKw = normalizeForSynonym(kw);

            for (const bird of birds) {
                for (const raw of safeArray(bird[rawKey])) {
                    const normRaw = normalizeForSynonym(raw);

                    if (normRaw === normKw) {
                        if (!out[cat][kw]) out[cat][kw] = [];
                        if (!out[cat][kw].includes(raw)) out[cat][kw].push(raw);
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
    names.forEach(n => nameMap[capitalizeName(n)] = n);

    for (const bird of birds) {
        const original = nameMap[bird.common_name] || bird.common_name;
        const keywords: string[] = [];

        for (const [cat, kws] of Object.entries(map)) {
            const rawKey = `_keywords_${cat.toLowerCase().replace(/\s+/g, '_')}`;
            const rawList = safeArray(bird[rawKey]);

            for (const kw of kws) {
                const rawArr = mapping[cat]?.[kw] || [];

                if (rawArr.some(raw => rawList.includes(raw))) {
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

    Object.values(birdKeywords).forEach(keywords => {
        const unique = new Set(keywords);
        unique.forEach(k => {
            counts[k] = (counts[k] || 0) + 1;
        });
    });

    const allowed = new Set(
        Object.entries(counts)
            .filter(([_, count]) => count >= minCount)
            .map(([k]) => k)
    );

    const filteredBirdKeywords: Record<string, string[]> = {};

    Object.entries(birdKeywords).forEach(([bird, keywords]) => {
        const filtered = keywords.filter(k => allowed.has(k));
        if (filtered.length > 0) {
            filteredBirdKeywords[bird] = filtered;
        }
    });

    return {
        filteredBirdKeywords,
        allowedKeywords: allowed,
    };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseData>) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { commonNames } = req.body;
        if (!Array.isArray(commonNames)) {
            return res.status(400).json({ error: 'commonNames must be array' });
        }

        const birds = await batchGetItemsParallel(commonNames);

        const rawKeywordsMap: Record<string, string[]> = {};
        birds.forEach(bird => {
            Object.entries(bird).forEach(([k, v]) => {
                if (k.startsWith('_keywords_')) {
                    const cat = k.replace('_keywords_', '').replace(/_/g, ' ');
                    const cap = cat.charAt(0).toUpperCase() + cat.slice(1);

                    rawKeywordsMap[cap] ||= [];
                    safeArray(v).forEach(val => rawKeywordsMap[cap].push(val));
                }
            });
        });

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

        Object.entries(normalizedKeywordsMap).forEach(([category, keywords]) => {
            const filtered = keywords.filter(k =>
                allowedKeywords.has(`${category}:${k}`)
            );

            if (filtered.length > 0) {
                filteredKeywordsMap[category] = filtered;
            }
        });

        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.status(200).json({
            keywordsMap: filteredKeywordsMap,
            birdKeywords: filteredBirdKeywords,
        });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
