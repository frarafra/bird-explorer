import React, { useContext, useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';

import { BirdContext } from '../contexts/BirdContext';
import { useRouter } from 'next/router';

interface SearchBoxProps {
    onSearch: (bird: string) => void;
}
interface ExtendedSuggestion {
    name: string;
    code: string;
}

const getExtendedSuggestions = async (bird: string, signal: AbortSignal) => {
    try {
        const timestamp = new Date().getTime();
        const response = await fetch(`/api/ebirdTaxonFind?bird=${bird}&_=${timestamp}`, { signal });
        if (!response.ok) throw new Error('Failed to fetch species');

        const speciesData = await response.json();
        if (speciesData.length === 0) {
            return;
        }

        return speciesData;
    } catch (error) {
        console.error('Error fetching species data:', error);
    }
};

const SearchBox: React.FC<SearchBoxProps> = ({ onSearch }) => {
    const { birds, setObservations, taxonomies } = useContext(BirdContext);
    const [bird, setBird] = useState('');
    const [extendedBird, setExtendedBird] = useState<Record<string, string>>({});
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [extendedSuggestions, setExtendedSuggestions] = useState<Record<string, string>[]>([]);
    const [suggestionSelected, setSuggestionSelected] = useState(false);
    const isInitialMount = useRef(true);
    const router = useRouter();

    useEffect(() => {
        if (isInitialMount.current) { 
            isInitialMount.current = false; 
            return; 
        }

        if (suggestionSelected) {
            return;
        }

        const controller = new AbortController();
        const signal = controller.signal;

        const debounceTimeout = setTimeout(() => {
            if (bird.length > 1) {
                const birdNames = Object.keys(birds);
                const fuse = new Fuse(birdNames, {
                    distance: process.env.NEXT_PUBLIC_FUSE_DISTANCE ? parseInt(process.env.NEXT_PUBLIC_FUSE_DISTANCE) : 100,
                    includeScore: true,
                    threshold: process.env.NEXT_PUBLIC_FUSE_THRESHOLD ? parseFloat(process.env.NEXT_PUBLIC_FUSE_THRESHOLD) : 0.4,
                });
                const fuzzyResults = fuse.search(bird)
                    .filter(result => result.score !== undefined && result.score < 0.4)
                    .map(result => result.item);

                if (fuzzyResults.length > 0) {
                    if (bird.length > 4 && taxonomies[birds[fuzzyResults[0]]]) {
                        const firstFamily = taxonomies[birds[fuzzyResults[0]]];
                        fuzzyResults.push(...birdNames.filter(suggestion =>
                            !fuzzyResults.includes(suggestion)
                            && taxonomies[birds[suggestion]] === firstFamily
                        ).slice(0, 4 - (fuzzyResults.length > 1 ? 1 : 0)));
                    }

                    setSuggestions(fuzzyResults);
                    setExtendedSuggestions([]);
                } else {
                    const extendedSuggestions = async () => {
                        const suggestions = await getExtendedSuggestions(bird, signal);
                        if (bird.length > 3) {
                            setExtendedSuggestions(suggestions?.map(({name, code}: ExtendedSuggestion) => ({
                                name: name.split(' - ')[0],
                                code: code
                            })));
                        }
                    };
                    extendedSuggestions();
                    setSuggestions([]);
                }
            } else {
                setSuggestions([]);
                setExtendedSuggestions([]);
            }
        }, 300);

        return () => {
            clearTimeout(debounceTimeout);
            controller.abort();
        };
    }, [bird]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!bird) return;
        setObservations([]);
        const speciesCode = birds[bird];
        const extendedSpeciesCode = extendedBird.code;
        const birdCode = speciesCode || extendedSpeciesCode;
        onSearch(birdCode);
        setBird('');
        setExtendedBird({});
        setSuggestions([]);
        setExtendedSuggestions([]);
        setSuggestionSelected(false);

        const queryParams = new URLSearchParams();
        queryParams.set('species', birdCode);
        if (extendedSpeciesCode) {
            queryParams.set('extended', 'true');
        }

        router.push(`/?${queryParams.toString()}`);    
    };

    return (
        <div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
                <input
                    type="text"
                    value={bird}
                    onChange={(e) => setBird(e.target.value)}
                    placeholder="Search for birds..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-400 dark:focus:ring-emerald-900 sm:px-3 sm:py-2 sm:text-base"
                />
                <button
                    type="submit"
                    disabled={!suggestionSelected}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:w-auto dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                >
                    Search
                </button>
            </form>

            {suggestions.length > 0 && (
                <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
                    {suggestions.map((suggestion, index) => (
                        <li
                            key={index}
                            onClick={() => {
                                setSuggestionSelected(true);
                                setBird(suggestion);
                                setSuggestions([]);
                                setExtendedBird({});
                                setExtendedSuggestions([]);
                            }}
                            className="mt-1 cursor-pointer rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        >
                            {suggestion}
                        </li>
                    ))}
                </ul>
            )}
            {extendedSuggestions?.length > 0 && (
                <div>
                    <p>Species outside the map bounds:</p>
                    <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
                        {extendedSuggestions.map((suggestion, index) => (
                            <li
                                key={index}
                                onClick={() => {
                                    setSuggestionSelected(true);
                                    setExtendedBird(suggestion);
                                    setBird(suggestion.name);
                                    setSuggestions([]);
                                    setExtendedSuggestions([]);
                                }}
                                className="mt-1 cursor-pointer rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                                {suggestion.name}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default SearchBox;
