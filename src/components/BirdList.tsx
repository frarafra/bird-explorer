import React, { FC, useContext, useState, useEffect } from 'react';
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

    const filteredSortedBirds =
        filterBirdsByKeywords(sortedBirds);

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
                style={{
                    marginBottom: '16px',
                    padding: '8px'
                }}
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
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        flexWrap: 'wrap',
                        marginBottom: '16px',
                        justifyContent: 'flex-start'
                    }}>
                        {Object.keys(keywordsByCategory).length > 0 && (
                            <button
                                onClick={() => setFiltersOpen(prev => !prev)}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: filtersOpen ? '#e0e0e0' : '#f0f0f0',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px'
                                }}
                            >
                                <span style={{ fontWeight: filtersOpen ? 600 : 400 }}>
                                    Filters
                                </span>
                                <span style={{
                                    display: 'inline-block',
                                    fontSize: '0.8rem',
                                    transform: filtersOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s ease'
                                }}>
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
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: isProcessing ? '#ccc' : '#f0f0f0',
                                    color: 'black',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: isProcessing ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {isProcessing ? 'Processing...' : sortMethod === 'default' ? 'Sort by Similarity' : 'Sort by Name'}
                            </button>
                        )}
                    </div>

                    {Object.keys(keywordsByCategory).length > 0 && filtersOpen && (
                        <div style={{
                            marginBottom: '16px',
                            border: '1px solid #e0e0e0',
                            borderRadius: '4px',
                            backgroundColor: '#f9f9f9',
                            padding: '12px'
                        }}>
                            {isLoadingKeywords ? (
                                <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                    Loading filters...
                                </div>
                            ) : (
                                Object.entries(keywordsByCategory)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([category, keywords]) => (
                                        <div key={category} style={{ marginBottom: '12px' }}>
                                            <strong style={{ fontSize: '0.78rem', color: '#555' }}>
                                                {category}
                                            </strong>
                                            <div style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: '6px',
                                                marginTop: '6px'
                                            }}>
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
                                                            style={{
                                                                fontSize: '0.75rem',
                                                                padding: '3px 8px',
                                                                borderRadius: '3px',
                                                                cursor: 'pointer',
                                                                backgroundColor: isSelected ? '#0277bd' : '#e8f4f8',
                                                                color: isSelected ? '#fff' : '#0277bd',
                                                                border: '1px solid #b3e5fc'
                                                            }}
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
                                style={{
                                    backgroundColor:
                                        '#f0f0f0',
                                    padding: '8px'
                                }}
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
                                        </div>
                                    )
                                )}
                        </div>
                    </div>
                )
            )}

            {isLoadingImages && <p>Loading...</p>}

            {selectedGroup === 'All Groups' && filteredBirds.length > (page + 1) * batchSize && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                    <button
                        onClick={loadMore}
                        disabled={isLoadingImages || (page + 1) * batchSize >= filteredBirds.length}
                        style={{ padding: '8px 16px', cursor: isLoadingImages ? 'not-allowed' : 'pointer' }}
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