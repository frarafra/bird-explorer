import React, { FC, useContext, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query'
import { BirdContext } from '../contexts/BirdContext';
import { fetchBirdsFilters } from '../utils/birdTaxonomyClient';

interface BirdData {
    name: string;
    imageUrl: string;
}

interface BirdListProps {
    birds: Record<string, string>;
    taxonomies: Record<string, string>;
}

const BirdList: FC<BirdListProps> = ({ birds, taxonomies }) => {
    const {
        birdImages,
        setBirdImages,
        page,
        setPage,
        selectedGroup,
        setSelectedGroup
    } = useContext(BirdContext);

    const [orderedBirds, setOrderedBirds] = useState<[string, string][]>([]);
    const [groups, setGroups] = useState<string[]>([]);

    const [sortMethod, setSortMethod] = useState<'default' | 'similarity'>(
        'default'
    );

    const [sortedBirds, setSortedBirds] = useState<[string, string][]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const [keywordsByCategory, setKeywordsByCategory] = useState<
        Record<string, Set<string>>
    >({});

    const [isLoadingKeywords, setIsLoadingKeywords] = useState(false);

    const [birdKeywords, setBirdKeywords] = useState<
        Record<string, string[]>
    >({});

    const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
        new Set()
    );

    const [filtersOpen, setFiltersOpen] = useState(false);

    const batchSize = Number(process.env.NEXT_PUBLIC_BATCH_SIZE);
    const lat = Number(process.env.NEXT_PUBLIC_LAT ?? 0);
    const lng = Number(process.env.NEXT_PUBLIC_LNG ?? 0);

    const router = useRouter();

    useEffect(() => {
        const warmUpLambda = async () => {
            try {
                const results = await fetch('/api/ebirdSimilarImages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ birds: ['ou'], birdImages: { 'ou': process.env.NEXT_PUBLIC_EBIRD_IMAGE_URL } }),
                });

                if (!results.ok) {
                    console.error(`Request failed with status:`, results.status, results.statusText);
                }
            } catch (error) {
                console.error('Unexpected error during warm-up:', error);
            }
        };

        warmUpLambda();
    }, []);

    const { data: imagesData, isLoading: isLoadingImages } = useQuery({
        queryKey: [
            'birdImages',
            selectedGroup,
            page,
            orderedBirds.length,
        ],
        queryFn: async () => {
            const filtered = filterBirdsByGroup(orderedBirds, selectedGroup);
            if (filtered.length === 0) {
                setSelectedGroup('All Groups');
                return {};
            }

            let batch: Record<string, string>;
            if (selectedGroup === 'All Groups') {
                const start = page * batchSize;
                const end = (page + 1) * batchSize;
                batch = filtered.slice(start, end).reduce((acc, [name, code]) => {
                    acc[name] = code;
                    return acc;
                }, {} as Record<string, string>);
            } else {
                batch = filtered.reduce((acc, [name, code]) => {
                    acc[name] = code;
                    return acc;
                }, {} as Record<string, string>);
            }

            if (Object.keys(batch).length === 0) return {};

            const response = await fetch('/api/ebirdImages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batch),
            });

            if (!response.ok) throw new Error('Failed to fetch images');
            
            return response.json();
        },
        enabled: orderedBirds.length > 0,
        staleTime: 1000 * 60 * 5,
    });

    useEffect(() => {
        if (selectedKeywords.size > 0) {
            setFiltersOpen(true);
        }
    }, [selectedKeywords]);

    useEffect(() => {
        if (
            Object.keys(birds).length > 0 &&
            Object.keys(taxonomies).length > 0
        ) {
            const uniqueGroups = getUniqueGroups(birds, taxonomies);

            setGroups(uniqueGroups);

            if (
                !selectedGroup ||
                !uniqueGroups.includes(selectedGroup)
            ) {
                setSelectedGroup('All Groups');
            }

            const allGroups = Array.from(
                new Set(Object.values(taxonomies))
            ).filter(Boolean);

            const sorted = sortBirdsByTaxonomy(
                birds,
                taxonomies,
                allGroups
            );

            setOrderedBirds(sorted);
        }
    }, [birds, taxonomies]);

    useEffect(() => {
        if (imagesData) {
            setBirdImages(prev => ({
            ...prev,
            ...imagesData.reduce((acc: Record<string, string>, bird: BirdData) => {
                acc[bird.name] = bird.imageUrl;
                return acc;
            }, {})
            }));
        }
    }, [imagesData, setBirdImages]);

    useEffect(() => {
        const clusterBirds = async (
            allBirds: [string, string][],
            images: Record<string, string>
        ) => {
            try {
                setSortedBirds([]);
                setIsProcessing(true);

                const response = await fetch(
                    '/api/ebirdSimilarImages',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            birds: allBirds,
                            birdImages: images
                        })
                    }
                );

                if (!response.ok) {
                    setSortedBirds(allBirds);
                    return;
                }

                const sortedData: [string, string][] =
                    await response.json();

                setSortedBirds(sortedData);
            } catch (err) {
                console.error('Clustering error:', err);
                setSortedBirds(allBirds);
            } finally {
                setIsProcessing(false);
            }
        };

        if (
            sortMethod === 'similarity' &&
            Object.keys(groupedBirds).length > 0
        ) {
            const allBirds = Object.values(groupedBirds).flat();

            if (allBirds.length > 0) {
                clusterBirds(allBirds, birdImages);
            }
        } else {
            setSortedBirds(orderedBirds);
        }
    }, [sortMethod, orderedBirds, birdImages]);

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
                        ([name, speciesCode]) =>
                            taxonomies[speciesCode] ===
                            selectedGroup
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
                    birdKeywords: fetchedBirdKeywords
                } = await fetchBirdsFilters(groupBirds);

                setKeywordsByCategory(keywordsMap);

                setBirdKeywords(fetchedBirdKeywords || {});

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

     const sortBirdsByTaxonomy = (
        birds: Record<string, string>,
        taxonomies: Record<string, string>,
        orderedGroups: string[]
    ) => {
        const transformNameForSorting = (
            name: string
        ): string => {
            if (!name) return '';

            return name
                .split(' ')
                .reverse()
                .join(', ');
        };

        return Object.entries(birds).sort(
            ([name1, speciesCode1], [name2, speciesCode2]) => {
                const group1 =
                    taxonomies[speciesCode1] || '';

                const group2 =
                    taxonomies[speciesCode2] || '';

                if (!group1) return 1;
                if (!group2) return -1;

                const index1 =
                    orderedGroups.indexOf(group1);

                const index2 =
                    orderedGroups.indexOf(group2);

                if (index1 !== index2) {
                    return index1 - index2;
                }

                return transformNameForSorting(
                    name1
                ).localeCompare(
                    transformNameForSorting(name2)
                );
            }
        );
    };

    const getUniqueGroups = (
        birds: Record<string, string>,
        taxonomies: Record<string, string>
    ) => {
        const groups = new Set<string>();

        Object.entries(birds).forEach(
            ([name, speciesCode]) => {
                const group = taxonomies[speciesCode];

                if (group) {
                    groups.add(group);
                }
            }
        );

        const sortedGroups = Array.from(groups).sort(
            (a, b) => a.localeCompare(b)
        );

        return ['All Groups', ...sortedGroups];
    };

    const filterBirdsByGroup = (
        birds: [string, string][],
        group: string
    ) => {
        if (group === 'All Groups') return birds;

        return birds.filter(
            ([name, speciesCode]) =>
                taxonomies[speciesCode] === group
        );
    };

    const filterBirdsByKeywords = (
        birds: [string, string][]
    ): [string, string][] => {
        if (selectedKeywords.size === 0) {
            return birds;
        }

        return birds.filter(([name]) => {
            const birdKeywordsList =
                birdKeywords[name] || [];

            return Array.from(
                selectedKeywords
            ).every(keyword =>
                birdKeywordsList.includes(keyword)
            );
        });
    };

    const groupBirdsByTaxonomy = (
        birdList: [string, string][]
    ) => {
        const groups: Record<
            string,
            [string, string][]
        > = {};

        birdList.forEach(([name, speciesCode]) => {
            const birdGroup =
                taxonomies[speciesCode] || 'Unknown';

            if (!groups[birdGroup]) {
                groups[birdGroup] = [];
            }

            groups[birdGroup].push([
                name,
                speciesCode
            ]);
        });

        return groups;
    };

    const loadMore = () => {
        if (
            !isLoadingImages &&
            page <
                Math.ceil(
                    filteredBirds.length / batchSize
                ) -
                    1
        ) {
            setPage(prevPage => prevPage + 1);
        }
    };

    const filteredBirds = filterBirdsByKeywords(
        filterBirdsByGroup(
            orderedBirds,
            selectedGroup
        )
    );

    const paginatedBirds =
        selectedGroup === 'All Groups'
            ? filteredBirds.slice(
                  0,
                  (page + 1) * batchSize
              )
            : filteredBirds;

    const groupedBirds =
        selectedGroup === 'All Groups'
            ? groupBirdsByTaxonomy(
                  paginatedBirds
              )
            : {
                  [selectedGroup]:
                      paginatedBirds
              };

    const speciesCodesForAbundance = useMemo(() => {
        const activeBirds = selectedGroup === 'All Groups' ? paginatedBirds : filteredBirds;

        return activeBirds
            .map(([, speciesCode]) => speciesCode)
            .filter(Boolean);
    }, [filteredBirds, paginatedBirds, selectedGroup]);

    const { data: abundanceData } = useQuery({
        queryKey: ['birdAbundance', selectedGroup, page, speciesCodesForAbundance, lat, lng],
        queryFn: async () => {
            const params = new URLSearchParams();
            speciesCodesForAbundance.forEach((speciesCode) => {
                params.append('species', speciesCode);
            });
            params.set('lat', String(lat));
            params.set('lng', String(lng));

            const response = await fetch(`/api/ebirdHowMany?${params.toString()}`);

            if (!response.ok) {
                throw new Error('Failed to fetch abundance data');
            }

            return response.json() as Promise<{
                birds?: Array<{
                    speciesCode: string;
                    total: number;
                    rate: number;
                }>;
            }>;
        },
        enabled: selectedGroup !== 'All Groups' && speciesCodesForAbundance.length > 1,
        staleTime: 1000 * 60 * 5,
    });

    const abundanceBySpeciesCode = useMemo(() => {
        return (abundanceData?.birds ?? []).reduce<Record<string, { total: number; rate: number }>>(
            (acc, bird) => {
                acc[bird.speciesCode] = {
                    total: bird.total,
                    rate: bird.rate,
                };
                return acc;
            },
            {}
        );
    }, [abundanceData]);

    const filteredSortedBirds =
        filterBirdsByKeywords(sortedBirds);

    const getAbundanceIcon = (rate: number) => {
        const filledBars = Math.max(0, Math.min(3, rate));

        return {
            filledBars,
            label:
                rate >= 3
                    ? 'High abundance'
                    : rate === 2
                      ? 'Medium abundance'
                      : rate === 1
                        ? 'Low abundance'
                        : 'No abundance',
        };
    };

    const birdsToDisplay =
        sortMethod === 'default'
            ? Object.entries(groupedBirds)
            : [
                  [
                      selectedGroup,
                      filteredSortedBirds
                  ]
              ];

    return (
        <div>

            <select
                value={selectedGroup}
                onChange={(e) => {
                    const selected = e.target.value;
                    setSelectedGroup(selected);
                    setPage(0);
                    setSortMethod('default');
                    setSortedBirds(orderedBirds);
                    setFiltersOpen(false);
                }}
                className="mb-4 rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
                {groups.map(group => (
                    <option
                        key={group}
                        value={group}
                    >
                        {group}
                    </option>
                ))}
            </select>

            {selectedGroup !== 'All Groups' && (
                <>
                    <div className="mb-4 flex flex-wrap items-center justify-start gap-2">
                        {Object.keys(keywordsByCategory).length > 0 && (
                            <button
                                onClick={() => setFiltersOpen(prev => !prev)}
                                className={`flex items-center justify-between gap-2 rounded px-4 py-2 text-sm text-black transition ${filtersOpen ? 'bg-slate-200' : 'bg-slate-100'} hover:bg-slate-200`}
                            >
                                <span className={filtersOpen ? 'font-semibold' : 'font-normal'}>
                                    Filters
                                </span>
                                <span className={`inline-block text-xs text-black ${filtersOpen ? 'rotate-90' : 'rotate-0'} transition-transform`}>
                                    ▶
                                </span>
                            </button>
                        )}

                        {filteredBirds.length > 2 && (
                            <button
                                onClick={() => {
                                    if (!isProcessing) {
                                        setSortMethod(
                                            sortMethod === 'default' ? 'similarity' : 'default'
                                        );
                                        if (sortMethod === 'default') {
                                            setSortedBirds([]);
                                            setIsProcessing(true);
                                        }
                                    }
                                }}
                                disabled={isProcessing}
                                className={`rounded px-4 py-2 text-sm text-black transition ${isProcessing ? 'cursor-not-allowed bg-slate-300' : 'cursor-pointer bg-slate-100 hover:bg-slate-200'}`}
                            >
                                {isProcessing ? 'Processing...' : sortMethod === 'default' ? 'Sort by Similarity' : 'Sort by Name'}
                            </button>
                        )}
                    </div>

                    {Object.keys(keywordsByCategory).length > 0 && filtersOpen && (
                        <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3">
                            {isLoadingKeywords ? (
                                <div className="text-sm text-slate-600">
                                    Loading filters...
                                </div>
                            ) : (
                                Object.entries(keywordsByCategory)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([category, keywords]) => (
                                        <div key={category} className="mb-3">
                                            <strong className="text-xs text-slate-600">
                                                {category}
                                            </strong>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {Array.from(keywords).sort().map(keyword => {
                                                    const keywordId = `${category}:${keyword}`;
                                                    const isSelected = selectedKeywords.has(keywordId);
                                                    return (
                                                        <span
                                                            key={keyword}
                                                            onClick={() => {
                                                                const next = new Set(selectedKeywords);
                                                                isSelected
                                                                    ? next.delete(keywordId)
                                                                    : next.add(keywordId);
                                                                setSelectedKeywords(next);
                                                                setSortMethod('default');
                                                                setSortedBirds(orderedBirds);
                                                            }}
                                                            className={`cursor-pointer rounded border px-2 py-1 text-xs ${isSelected ? 'border-sky-600 bg-sky-600 text-white' : 'border-sky-100 bg-sky-50 text-sky-700'}`}
                                                        >
                                                            {keyword}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))
                            )}
                        </div>
                    )}
                </>
            )}

            {birdsToDisplay.map(
                ([groupName, groupBirds]) => (
                    <div
                        key={String(groupName)}
                    >
                        {selectedGroup ===
                            'All Groups' && (
                            <h3
                                className="bg-slate-100 p-2 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                            >
                                {groupName}
                            </h3>
                        )}

                        <div className="bird-grid">
                            {Array.isArray(
                                groupBirds
                            ) &&
                                groupBirds.map(
                                    ([
                                        name,
                                        speciesCode
                                    ]) => (
                                        <div
                                            className="bird-card"
                                            key={
                                                name
                                            }
                                        >
                                            {birdImages[
                                                name
                                            ] && (
                                                <img
                                                    src={
                                                        birdImages[
                                                            name
                                                        ]
                                                    }
                                                    alt={
                                                        name
                                                    }
                                                    className="bird-image"
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            )}

                                            <div
                                                className="mt-2 flex items-center gap-1 text-sm font-medium text-slate-900 dark:text-slate-100"
                                            >
                                                <span
                                                    onClick={() =>
                                                        router.push(
                                                            `/?species=${speciesCode}`
                                                        )
                                                    }
                                                    style={{
                                                        cursor:
                                                            'pointer'
                                                    }}
                                                >
                                                    {
                                                        name
                                                    }
                                                </span>

                                                {(() => {
                                                    const abundance = abundanceBySpeciesCode[speciesCode];
                                                    const iconData = abundance ? getAbundanceIcon(abundance.rate) : null;

                                                    return iconData ? (
                                                        <span
                                                            title={iconData.label}
                                                            aria-label={iconData.label}
                                                            className="ml-1 flex items-end gap-1"
                                                        >
                                                            {Array.from({ length: 3 }).map((_, index) => (
                                                                <span
                                                                    key={index}
                                                                    className={`inline-block h-2 w-2 rounded-sm ${index < iconData.filledBars ? 'bg-slate-900 dark:bg-slate-300' : 'bg-slate-300 dark:bg-slate-900'}`}
                                                                />
                                                            ))}
                                                        </span>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                    )
                                )}
                        </div>
                    </div>
                )
            )}

            {isLoadingImages && <p>Loading...</p>}

            {selectedGroup === 'All Groups' && filteredBirds.length > (page + 1) * batchSize && (
                <div className="mt-3 text-center">
                    <button
                        onClick={loadMore}
                        disabled={isLoadingImages || (page + 1) * batchSize >= filteredBirds.length}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                    >
                        {isLoadingImages ? 'Loading…' : 'Load More'}
                    </button>
                </div>
            )}

            <style jsx>{`
                details summary::-webkit-details-marker {
                    display: none;
                }

                details summary {
                    list-style: none;
                }
            `}</style>
        </div>
    );
};

export default BirdList;