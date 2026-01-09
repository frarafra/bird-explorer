import React, { useContext, useState, useEffect, useRef } from 'react';

import { BirdContext } from '../contexts/BirdContext';
import { useRouter } from 'next/router';

interface SearchBoxProps {
    onSearch: (bird: string) => void;
}
interface ExtendedSuggestion {
    name: string;
    code: string;
}

const SearchBox: React.FC<SearchBoxProps> = ({ onSearch }) => {
    const [bird, setBird] = useState('');
    const [extendedBird, setExtendedBird] = useState<Record<string, string>>({});
    const { birds, setObservations, taxonomies } = useContext(BirdContext);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [extendedSuggestions, setExtendedSuggestions] = useState<Record<string, string>[]>([]);
    const isInitialMount = useRef(true);
    const router = useRouter();

    const getExtendedSuggestions = async (bird: string) => {
        try {
            const response = await fetch(`/api/ebirdTaxonFind?bird=${bird}`);
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

    useEffect(() => {
        if (isInitialMount.current) { 
            isInitialMount.current = false; 
            return; 
        }
 
        if (bird.length > 0) {
            const filteredSuggestions = Object.keys(birds).filter(suggestion =>
                suggestion.toLowerCase().includes(bird.toLowerCase())
            ).sort();
            
            if (filteredSuggestions.length > 0) {
                if (bird.length > 4 && taxonomies[birds[filteredSuggestions[0]]]) {
                    const firstFamily = taxonomies[birds[filteredSuggestions[0]]];
                    filteredSuggestions.push(...Object.keys(birds).filter(suggestion =>
                        !filteredSuggestions.includes(suggestion)
                        && taxonomies[birds[suggestion]] === firstFamily
                    ).slice(0, 4 - (filteredSuggestions.length > 1 ? 1 : 0)));
                }

                setSuggestions(filteredSuggestions);
                setExtendedSuggestions([]);
            } else {
                if (bird.length > 2) {
                    const extendedSuggestions = async () => {
                        const suggestions = await getExtendedSuggestions(bird);
                        setExtendedSuggestions(suggestions?.map(({name, code}: ExtendedSuggestion) => ({
                            name: name.split(' - ')[0],
                            code: code
                        })).sort((a: ExtendedSuggestion, b: ExtendedSuggestion) => a.name.localeCompare(b.name)));
                    };
                    extendedSuggestions();
                    setSuggestions([]);
                }            
            }
        } else {
            setSuggestions([]);
            setExtendedSuggestions([]);
        }
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

        const queryParams = new URLSearchParams();
        queryParams.set('species', birdCode);
        if (extendedSpeciesCode) {
            queryParams.set('extended', 'true');
        }

        router.push(`/?${queryParams.toString()}`);    
    };

    return (
        <div>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={bird}
                    onChange={(e) => setBird(e.target.value)}
                    placeholder="Search for birds..."
                />
                <button type="submit">Search</button>
            </form>

            {suggestions.length > 0 && (
                <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
                    {suggestions.map((suggestion, index) => (
                        <li
                            key={index}
                            onClick={() => {
                                setBird(suggestion);
                                setSuggestions([]);
                                setExtendedBird({});
                                setExtendedSuggestions([]);
                            }}
                            style={{
                                cursor: 'pointer',
                                padding: '4px 8px',
                                backgroundColor: '#f0f0f0',
                                marginTop: '2px'
                            }}
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
                                    setExtendedBird(suggestion);
                                    setBird(suggestion.name);
                                    setSuggestions([]);
                                    setExtendedSuggestions([]);
                                }}
                                style={{
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    backgroundColor: '#f0f0f0',
                                    marginTop: '2px'
                                }}
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
