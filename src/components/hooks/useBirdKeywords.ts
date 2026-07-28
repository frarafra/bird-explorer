import { useCallback, useEffect, useMemo, useState } from 'react';

type BirdEntry = [string, string];

type UseBirdKeywordsProps = {
    orderedBirds: BirdEntry[];
    selectedGroup: string;
    taxonomies: Record<string, string>;
};

export interface BirdTaxonomy {
    common_name: string;
    category?: string;
    [key: string]: any;
}

export interface FetchBirdsTaxonomyResponse {
    birds: BirdTaxonomy[];
    keywordsMap: Record<string, Set<string>>;
    birdKeywords?: Record<string, string[]>;
}

const fetchBirdsFilters = async (
    commonNames: string[]
): Promise<FetchBirdsTaxonomyResponse> => {
    if (!commonNames || commonNames.length === 0) {
        return { birds: [], keywordsMap: {} };
    }

    console.log('Fetching taxonomy for:', commonNames);

    try {
        const response = await fetch('/api/getBirdsTags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ commonNames }),
        });

        console.log('API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API error response:', errorText);
            try {
                const error = JSON.parse(errorText);
                throw new Error(error.error || `Failed to fetch bird data: ${response.status}`);
            } catch {
                throw new Error(`Failed to fetch bird data: ${response.status} - ${errorText.substring(0, 100)}`);
            }
        }

        const data = await response.json();
        console.log('API response data:', data);

        return data;
    } catch (error) {
        console.error('Error fetching bird taxonomy:', error);
        throw error;
    }
};

export function useBirdKeywords({
    orderedBirds,
    selectedGroup,
    taxonomies,
}: UseBirdKeywordsProps) {
    const [keywordsByCategory, setKeywordsByCategory] = useState<
        Record<string, Set<string>>
    >({});

    const [birdKeywords, setBirdKeywords] = useState<
        Record<string, string[]>
    >({});

    const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
        new Set()
    );

    const [filtersOpen, setFiltersOpen] = useState(false);

    const [isLoadingKeywords, setIsLoadingKeywords] = useState(false);

    useEffect(() => {
        if (selectedKeywords.size > 0) {
            setFiltersOpen(true);
        }
    }, [selectedKeywords]);

    useEffect(() => {
        const fetchAndProcessKeywords = async () => {
            if (selectedGroup === 'All Groups') {
                setKeywordsByCategory({});
                setBirdKeywords({});
                setSelectedKeywords(new Set());

                return;
            }

            try {
                setIsLoadingKeywords(true);

                const groupBirds = orderedBirds
                    .filter(
                        ([, speciesCode]) =>
                            taxonomies[speciesCode] === selectedGroup
                    )
                    .map(([name]) => name);

                if (groupBirds.length === 0) {
                    setKeywordsByCategory({});
                    setBirdKeywords({});
                    setSelectedKeywords(new Set());

                    return;
                }

                const {
                    keywordsMap,
                    birdKeywords: fetchedBirdKeywords,
                } = await fetchBirdsFilters(groupBirds);

                setKeywordsByCategory(keywordsMap);
                setBirdKeywords(fetchedBirdKeywords ?? {});
                setSelectedKeywords(new Set());
            } catch (error) {
                console.error(
                    'Error fetching bird keywords:',
                    error
                );

                setKeywordsByCategory({});
                setBirdKeywords({});
                setSelectedKeywords(new Set());
            } finally {
                setIsLoadingKeywords(false);
            }
        };

        fetchAndProcessKeywords();
    }, [selectedGroup, orderedBirds, taxonomies]);

    const filterBirdsByKeywords = useCallback(
      (birds: BirdEntry[]) => {
          if (selectedKeywords.size === 0) {
              return birds;
          }

          return birds.filter(([name]) => {
              const keywords = birdKeywords[name] ?? [];

              return [...selectedKeywords].every(keyword =>
                  keywords.includes(keyword)
              );
          });
      },
      [birdKeywords, selectedKeywords]
    );

    const filteredBirds = useMemo(() => {
        let birds = orderedBirds;

        if (selectedGroup !== 'All Groups') {
            birds = birds.filter(
                ([, speciesCode]) =>
                    taxonomies[speciesCode] === selectedGroup
            );
        }

        if (selectedKeywords.size === 0) {
            return birds;
        }

        return birds.filter(([name]) => {
            const keywords = birdKeywords[name] ?? [];

            return [...selectedKeywords].every(keyword =>
                keywords.includes(keyword)
            );
        });
    }, [
        orderedBirds,
        selectedGroup,
        taxonomies,
        birdKeywords,
        selectedKeywords,
    ]);
      
    return {
        filteredBirds,
        keywordsByCategory,
        selectedKeywords,
        setSelectedKeywords,
        filtersOpen,
        setFiltersOpen,
        isLoadingKeywords,
        filterBirdsByKeywords,
    };
}