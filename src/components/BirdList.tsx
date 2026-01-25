import React, { FC, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { BirdContext } from '../contexts/BirdContext';

interface BirdData {
    name: string;
    imageUrl: string;
}

interface BirdListProps {
    birds: Record<string, string>;
    taxonomies: Record<string, string>;
}

const BirdList: FC<BirdListProps> = ({ birds, taxonomies }) => {
    const { birdImages, setBirdImages, page, setPage } = useContext(BirdContext);
    const [orderedBirds, setOrderedBirds] = useState<[string, string][]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<string>('All Groups');
    const [groups, setGroups] = useState<string[]>([]);
    const batchSize = Number(process.env.NEXT_PUBLIC_BATCH_SIZE);

    const router = useRouter();

    const fetchBatchImages = async (batch: Record<string, string>) => {
        try {
            const response = await fetch('/api/ebirdImages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batch),
            });

            if (!response.ok) throw new Error('Failed to fetch images');

            const data = await response.json();
            setBirdImages(prev => ({
                ...prev,
                ...data.reduce((acc: Record<string, string>, bird: BirdData) => {
                    acc[bird.name] = bird.imageUrl;
                    return acc;
                }, {}),
            }));
        } catch (error) {
            console.error('Error fetching images:', error);
        }
    };

    const sortBirdsByTaxonomy = (
        birds: Record<string, string>,
        taxonomies: Record<string, string>,
        orderedGroups: string[]
    ) => {
        const findGroupIndex = (group: string): number => {
            let index = orderedGroups.indexOf(group);
            if (index !== -1) return index;

            const taxons = group.split(/\s+/);
            for (let i = 0; i < orderedGroups.length; i++) {
                const taxonsSorted = orderedGroups[i].split(/\s+/);
                if (taxons.some(taxon => taxon !== 'and' && taxonsSorted.includes(taxon))) {
                    index = i;
                }
            }

            return index === -1 ? Number.MAX_SAFE_INTEGER : index;
        };

        const transformNameForSorting = (name: string): string => {
            if (!name) return '';
            const parts = name.split(' ').reverse().join(', ');
            return parts;
        };

        return Object.entries(birds).sort(([name1, speciesCode1], [name2, speciesCode2]) => {
            const group1 = taxonomies[speciesCode1] || '';
            const group2 = taxonomies[speciesCode2] || '';

            if (!group1) return 1;
            if (!group2) return -1;

            const index1 = findGroupIndex(group1);
            const index2 = findGroupIndex(group2);

            if (index1 !== index2) {
                return index1 - index2;
            }

            return transformNameForSorting(name1).localeCompare(transformNameForSorting(name2));
        });
    };

    const getUniqueGroups = (birds: Record<string, string>, taxonomies: Record<string, string>) => {
        const groups = new Set<string>();
        Object.entries(birds).forEach(([name, speciesCode]) => {
            const group = taxonomies[speciesCode];
            if (group) groups.add(group);
        });
        const sortedGroups = Array.from(groups).sort((a, b) => a.localeCompare(b));
        return ['All Groups', ...sortedGroups];
    };

    const filterBirdsByGroup = (birds: [string, string][], group: string) => {
        if (group === 'All Groups') return birds;
        return birds.filter(([name, speciesCode]) => {
            const birdGroup = taxonomies[speciesCode];
            return birdGroup === group;
        });
    };

    useEffect(() => {
        setBirdImages({});
        setPage(0);
        setSelectedGroup('All Groups');
    }, [setBirdImages, setPage, setSelectedGroup]);


    useEffect(() => {
        if (Object.keys(birds).length > 0) {
            const uniqueGroups = getUniqueGroups(birds, taxonomies);
            setGroups(uniqueGroups);

            const allGroups = Array.from(new Set(Object.values(taxonomies))).filter(Boolean);
            const sorted = sortBirdsByTaxonomy(birds, taxonomies, allGroups);
            setOrderedBirds(sorted);
        }
    }, [birds, taxonomies]);

    useEffect(() => {
        if (orderedBirds.length > 0) {
            const filtered = filterBirdsByGroup(orderedBirds, selectedGroup);
            if (selectedGroup === 'All Groups') {
                if (page < Math.ceil(filtered.length / batchSize)) {
                    const currentBatch = filtered
                        .slice(page * batchSize, (page + 1) * batchSize)
                        .reduce((acc: Record<string, string>, [name, code]) => {
                            acc[name] = code;
                            return acc;
                        }, {});
                    setIsLoading(true);
                    fetchBatchImages(currentBatch).finally(() => setIsLoading(false));
                }
            } else {
                const allBirdsInGroup = filtered.reduce((acc: Record<string, string>, [name, code]) => {
                    acc[name] = code;
                    return acc;
                }, {});
                setIsLoading(true);
                fetchBatchImages(allBirdsInGroup).finally(() => setIsLoading(false));
            }
        }
    }, [orderedBirds, selectedGroup, page]);

    const loadMore = () => {
        if (!isLoading && page < Math.ceil(orderedBirds.length / batchSize)) {
            setPage(prevPage => prevPage + 1);
        }
    };

    return (
        <div>
            <select
                value={selectedGroup}
                onChange={(e) => {
                    setSelectedGroup(e.target.value);
                    setPage(0);
                    setBirdImages({});
                }}
                style={{ marginBottom: '16px', padding: '8px' }}
            >
                {groups.map(group => (
                    <option key={group} value={group}>{group}</option>
                ))}
            </select>

            <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
                {Object.entries(birdImages).map(([name, birdImageUrl]) => {
                    const speciesCode = birds[name];
                    const birdGroup = taxonomies[speciesCode];
                    const shouldShow = selectedGroup === 'All Groups' || birdGroup === selectedGroup;

                    if (!shouldShow) return null;

                    const handleClick = () => router.push(`/?species=${speciesCode}`);

                    return (
                        <li key={name} style={{
                            cursor: 'default',
                            padding: '4px 8px',
                            backgroundColor: '#f5f5f5',
                            marginTop: '2px',
                            display: 'flex',
                            alignItems: 'center'
                        }}>
                            {birdImageUrl && (
                                <img
                                    src={birdImageUrl}
                                    alt={name}
                                    style={{
                                        width: '40px',
                                        height: 'auto',
                                        marginRight: '8px',
                                        transition: 'transform 0.3s ease-in-out',
                                        cursor: 'pointer'
                                    }}
                                    onMouseOver={(e) => {
                                        (e.target as HTMLElement).style.transform = 'scale(2)';
                                    }}
                                    onMouseOut={(e) => {
                                        (e.target as HTMLElement).style.transform = 'scale(1)';
                                    }}
                                    loading="lazy"
                                />
                            )}
                            <span onClick={handleClick} style={{ cursor: 'pointer' }}>
                                {name}
                            </span>
                        </li>
                    );
                })}
            </ul>
            {isLoading && <p>Loading...</p>}
            {selectedGroup === 'All Groups' && (
                <button
                    onClick={loadMore}
                    disabled={isLoading || page >= Math.ceil(Object.keys(birds).length / batchSize)}
                >
                    Load More
                </button>
            )}
        </div>
    );
};

export default BirdList;
