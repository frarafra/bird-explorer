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
    const { birdImages, setBirdImages, page, setPage, selectedGroup, setSelectedGroup } = useContext(BirdContext);
    const [orderedBirds, setOrderedBirds] = useState<[string, string][]>([]);
    const [isLoading, setIsLoading] = useState(false);
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

    const groupBirdsByTaxonomy = (birdList: [string, string][]) => {
        const groups: Record<string, [string, string][]> = {};

        birdList.forEach(([name, speciesCode]) => {
            const birdGroup = taxonomies[speciesCode] || 'Unknown';
            if (!groups[birdGroup]) {
                groups[birdGroup] = [];
            }
            groups[birdGroup].push([name, speciesCode]);
        });

        return groups;
    };

    useEffect(() => {
        if (Object.keys(orderedBirds).length === 0 && Object.keys(birds).length > 0) {
            const uniqueGroups = getUniqueGroups(birds, taxonomies);
            setGroups(uniqueGroups);

            const allGroups = Array.from(new Set(Object.values(taxonomies))).filter(Boolean);
            const sorted = sortBirdsByTaxonomy(birds, taxonomies, allGroups);
            setOrderedBirds(sorted);
        }
    }, [birds, taxonomies, orderedBirds]);

    useEffect(() => {
        if (orderedBirds.length === 0) return;

        const filtered = filterBirdsByGroup(orderedBirds, selectedGroup);
        if (filtered.length === 0) {
            setSelectedGroup('All Groups');
        };

        if (selectedGroup === 'All Groups') {
            const start = page * batchSize;
            const end = (page + 1) * batchSize;
            const currentBatch = filtered.slice(start, end)
                .reduce((acc: Record<string, string>, [name, code]) => {
                    acc[name] = code;
                    return acc;
                }, {});
            if (Object.keys(currentBatch).length > 0) {
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
    }, [orderedBirds, selectedGroup, page]);

    const loadMore = () => {
        if (!isLoading && page < Math.ceil(filterBirdsByGroup(orderedBirds, selectedGroup).length / batchSize) - 1) {
            setPage(prevPage => prevPage + 1);
        }
    };
    
    const filteredBirds = filterBirdsByGroup(orderedBirds, selectedGroup);
    const paginatedBirds =
        selectedGroup === 'All Groups'
            ? orderedBirds.slice(0, (page + 1) * batchSize)
            : orderedBirds.filter(([name, code]) => taxonomies[code] === selectedGroup);
    const groupedBirds =
        selectedGroup === 'All Groups'
            ? groupBirdsByTaxonomy(paginatedBirds)
            : { [selectedGroup]: paginatedBirds };

    return (
<div>
  <select
    value={selectedGroup}
    onChange={(e) => {
      setSelectedGroup(e.target.value);
      setPage(0);
    }}
    style={{ marginBottom: '16px', padding: '8px' }}
  >
    {groups.map(group => (
      <option key={group} value={group}>{group}</option>
    ))}
  </select>

  {Object.entries(groupedBirds).map(([groupName, groupBirds]) => (
    <div key={groupName}>
      {selectedGroup === 'All Groups' && (
        <h3 style={{ backgroundColor: '#f0f0f0', padding: '8px' }}>{groupName}</h3>
      )}

      <div className="bird-grid">
        {groupBirds.map(([name, speciesCode]) => (
          <div className="bird-card" key={name}>
            {birdImages[name] && (
              <img
                src={birdImages[name]}
                alt={name}
                className="bird-image"
                loading="lazy"
              />
            )}
            <span
                onClick={() => router.push(`/?species=${speciesCode}`)}
                style={{ cursor: 'pointer' }}
            >
              {name}
            </span>
          </div>
        ))}
      </div>
    </div>
  ))}

  {isLoading && <p>Loading...</p>}
  {selectedGroup === 'All Groups' && (
    <button
      onClick={loadMore}
      disabled={isLoading || (page + 1) * batchSize >= filteredBirds.length}
    >
      Load More
    </button>
  )}
</div>

    );
};

export default BirdList;
