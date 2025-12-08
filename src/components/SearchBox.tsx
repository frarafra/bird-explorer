import React, { useContext, useState, useEffect, useRef } from 'react';

import { BirdContext } from '../contexts/BirdContext';
import { useRouter } from 'next/router';

interface SearchBoxProps {
    onSearch: (bird: string) => void;
}

const SearchBox: React.FC<SearchBoxProps> = ({ onSearch }) => {
    const [bird, setBird] = useState('');
    const { birds, taxonomies } = useContext(BirdContext);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const isInitialMount = useRef(true);
    const router = useRouter();
    
    useEffect(() => {
        if (isInitialMount.current) { 
            isInitialMount.current = false; 
            return; 
        }
 
        if (bird.length > 0) {
            const filteredSuggestions = Object.keys(birds).filter(suggestion =>
                suggestion.toLowerCase().includes(bird.toLowerCase())
            ).sort();
            
            if (bird.length > 4 && taxonomies[birds[filteredSuggestions[0]]]) {
                const firstFamily = taxonomies[birds[filteredSuggestions[0]]];
                filteredSuggestions.push(...Object.keys(birds).filter(suggestion =>
                    !filteredSuggestions.includes(suggestion)
                    && taxonomies[birds[suggestion]] === firstFamily
                ).slice(0, 4 - (filteredSuggestions.length > 1 ? 1 : 0)));
            }

            setSuggestions(filteredSuggestions);
        } else {
            setSuggestions([]);
        }
    }, [bird]);

    const handleSubmit = (event: React.FormEvent) => {
        const speciesCode = birds[bird];
        event.preventDefault();
        onSearch(speciesCode);
        setBird('');
        setSuggestions([]);
        router.push(`/?species=${speciesCode}`);
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
        </div>
    );
};

export default SearchBox;
