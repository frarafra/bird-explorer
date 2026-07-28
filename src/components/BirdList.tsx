import React, { FC, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { BirdContext } from '../contexts/BirdContext';
import { useBirdAbundance } from './hooks/useBirdAbundance';
import { useBirdKeywords } from './hooks/useBirdKeywords';
import { useBirdSimilarity } from './hooks/useBirdSimilarity';
import { useBirdImages } from './hooks/useBirdImages';
import { useBirdTaxonomy } from './hooks/useBirdTaxonomy';

interface BirdListProps {
    birds: Record<string, string>;
    taxonomies: Record<string, string>;
}

const BirdList: FC<BirdListProps> = ({ birds, taxonomies }) => {
    const {
        birdImages,
        page,
        setPage,
        selectedGroup,
        setSelectedGroup
    } = useContext(BirdContext);


    const [sortMethod, setSortMethod] = useState<
        'name' | 'similarity' | 'abundance'
    >('name');

    const batchSize = Number(process.env.NEXT_PUBLIC_BATCH_SIZE);
    const lat = Number(process.env.NEXT_PUBLIC_LAT ?? 0);
    const lng = Number(process.env.NEXT_PUBLIC_LNG ?? 0);

    const router = useRouter();

    const {
        groups,
        orderedBirds,
        birdsByGroup,
        groupBirds
    } = useBirdTaxonomy({
        birds,
        taxonomies,
        selectedGroup,
        setSelectedGroup,
    });

    const {
        isLoading: isLoadingImages,
    } = useBirdImages({
        birds: birdsByGroup,
        selectedGroup,
        setSelectedGroup,
    });

    const {
        filteredBirds,
        keywordsByCategory,
        selectedKeywords,
        setSelectedKeywords,
        filtersOpen,
        setFiltersOpen,
        isLoadingKeywords,
        filterBirdsByKeywords,
    } = useBirdKeywords({
        orderedBirds,
        selectedGroup,
        taxonomies,
    });

    const paginatedBirds =
        selectedGroup === 'All Groups'
            ? filteredBirds.slice(
                  0,
                  (page + 1) * batchSize
              )
            : filteredBirds;

    const groupedPaginatedBirds =
        selectedGroup === 'All Groups'
            ? groupBirds(paginatedBirds)
            : {
                [selectedGroup]: paginatedBirds,
            };

    const {sortedBirds, setSortedBirds, isProcessing} = useBirdSimilarity({
        groupedBirds: groupedPaginatedBirds,
        birdImages,
        sortMethod
    });
    
    const filteredSortedBirds =
        filterBirdsByKeywords(sortedBirds);


    const {
        abundanceBySpeciesCode,
        abundanceSortedBirds,
        getAbundanceIcon,
    } = useBirdAbundance({
        filteredBirds,
        paginatedBirds,
        selectedGroup,
        lat,
        lng,
    });

    const birdsToDisplay =
        sortMethod === 'name'
            ? Object.entries(groupedPaginatedBirds)
            : [
                [
                    selectedGroup,
                    sortMethod === 'similarity'
                        ? filteredSortedBirds
                        : abundanceSortedBirds,
                ],
            ];

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

    return (
        <div>

            <select
                value={selectedGroup}
                onChange={(e) => {
                    const selected = e.target.value;
                    setSelectedGroup(selected);
                    setPage(0);
                    setSortMethod('name');
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
                                <span
                                    className={`inline-block text-slate-500 transition-transform duration-200 ${
                                        filtersOpen ? 'rotate-90' : ''
                                    }`}
                                >
                                    ›
                                </span>
                            </button>
                        )}

                        {filteredBirds.length > 1 && (
                            <select
                                value={sortMethod}
                                onChange={(e) => {
                                    setSortMethod(
                                        e.target.value as 'name' | 'similarity' | 'abundance'
                                    );
                                }}
                                disabled={isProcessing}
                                className="rounded bg-slate-100 px-4 py-2 text-sm text-black transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100"
                            >
                                <option value="name">Sort By Name</option>
                                <option value="abundance">Sort By Abundance</option>
                                {filteredBirds.length > 2 && (
                                    <option value="similarity">Sort by Similarity</option>
                                )}
                            </select>
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
                                                                setSortMethod('name');
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
                                                            {Array.from({ length: 4 }).map((_, index) => (
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