import React from 'react';

import { Result } from '../types';

interface SearchResultsProps {
    results: Array<Result>;
    setHoveredResultId: (id: number | null) => void;
}

export const EBIRD_SPECIES_URL = 'https://ebird.org/species/';

const SearchResults: React.FC<SearchResultsProps> = ({ results, setHoveredResultId }) => {
    return (
        <div>
            {results.length > 0 && (
                <h4 className="mb-3 text-slate-900 dark:text-slate-100">
                    Search Results for{' '}
                    <a href={`${EBIRD_SPECIES_URL}${results[0].speciesCode}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
                        {results[0].comName}
                    </a>
                </h4>
            )}
            <ul className="space-y-2">
                {results.map(result => (
                    <li
                        key={result.subId}
                        onMouseEnter={() => setHoveredResultId(result.subId)}
                        onMouseLeave={() => setHoveredResultId(null)}
                        className="rounded-md border border-slate-200 bg-white/80 p-3 text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
                    >
                        <h5 className="text-slate-900 dark:text-slate-100">{result.locName}</h5>
                        <p className="text-slate-600 dark:text-slate-300">{result.obsDt}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default SearchResults;