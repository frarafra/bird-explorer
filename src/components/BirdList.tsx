import React, { FC, useContext, useState, useEffect } from 'react';
import Image from 'next/image';
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

    const fetchTaxonomyGroups = async () => {
        try {
            const response = await fetch('/api/taxonomy/groups');

            if (!response.ok) {
                throw new Error(`Failed to fetch taxonomies: ${response.statusText}`);
            }

            const taxonomies = await response.json();

            return taxonomies;
        } catch (error) {
            console.error('Error fetching taxonomies:', error);
            return [];
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

    useEffect(() => {
        const initializeTaxonomyGroups = async () => {
            const orderedGroups = await fetchTaxonomyGroups();
            if (Object.keys(birds).length > 0 && orderedGroups.length > 0) {
                setOrderedBirds(sortBirdsByTaxonomy(birds, taxonomies, orderedGroups));
            }
        };

        initializeTaxonomyGroups();
    }, [birds, taxonomies]);

    useEffect(() => {
        if (orderedBirds?.length > 0 && page < Math.ceil(orderedBirds.length / batchSize)) {
            const currentBatch = orderedBirds
                .slice(page * batchSize, (page + 1) * batchSize)
                .reduce((acc: Record<string, string>, [name, code]) => {
                    acc[name] = code;
                    return acc;
                }, {});

            setIsLoading(true);
            fetchBatchImages(currentBatch).finally(() => setIsLoading(false));
        }
    }, [orderedBirds, page]);

    const loadMore = () => {
        if (!isLoading && page < Math.ceil(Object.keys(birds).length / batchSize)) {
            setPage(prevPage => prevPage + 1);
        }
    };

    return (
        <div>
            <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
                {Object.entries(birdImages).map(([name, birdImageUrl]) => {
                    const speciesCode = birds[name];

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
                                <Image
                                    src={birdImageUrl}
                                    alt={name}
                                    width={40}
                                    height={40}
                                    style={{
                                        width: 'auto',
                                        height: 'auto',
                                        marginRight: '8px',
                                        transition: 'transform 0.3s ease-in-out',
                                        cursor: 'pointer'
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.transform = 'scale(2)';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.transform = 'scale(1)';
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
            <button onClick={loadMore} disabled={isLoading || page >= Math.ceil(Object.keys(birds).length / batchSize)}>
                Load More
            </button>
        </div>
    );
};

export default BirdList;