'use client';

import React, { useState, useEffect, useRef } from 'react';

interface BirdsLocationProps {
    lat: number;
    lng: number;
    species: string[];
}

interface ComparisonResultsProps {
    point1: BirdsLocationProps;
    point2: BirdsLocationProps;
    onClose: () => void;
}

const getLocationName = async (lat: number, lng: number): Promise<string> => {
    const response = await fetch(`/api/osmReverseGeocode?lat=${lat}&lng=${lng}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch location name: ${response.statusText}`);
    }
    const data = await response.json();
    return data.locationName || `${lat}, ${lng}`;
};

const ComparisonResults: React.FC<ComparisonResultsProps> = ({ point1, point2, onClose }) => {
    const [locationName1, setLocationName1] = useState<string>('');
    const [locationName2, setLocationName2] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchLocationNames = async () => {
            try {
                const name1 = await getLocationName(point1.lat, point1.lng);
                const name2 = await getLocationName(point2.lat, point2.lng);
                setLocationName1(name1);
                setLocationName2(name2);
            } catch (error) {
                console.error('Error fetching location names:', error);
                setLocationName1(`${point1.lat}, ${point1.lng}`);
                setLocationName2(`${point2.lat}, ${point2.lng}`);
            } finally {
                setIsLoading(false);
            }
        };

        fetchLocationNames();
    }, [point1, point2]);

    const scrollToTop = () => {
        if (containerRef.current) {
            containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    if (!point1 || !point2) return null;
    if (isLoading) return null;

    const birds1 = [...new Set(point1.species)];
    const birds2 = [...new Set(point2.species)];

    const commonBirds = birds1.filter(bird => birds2.includes(bird));

    const uniqueToPoint1 = birds1.filter(bird => !birds2.includes(bird));
    const uniqueToPoint2 = birds2.filter(bird => !birds1.includes(bird));

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'white',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 0 10px rgba(0,0,0,0.3)',
                zIndex: 1000,
                maxWidth: '80%',
                maxHeight: '80%',
                overflow: 'auto'
            }}
        >
            <h3>Comparison Results</h3>
            <button onClick={onClose} style={{ float: 'right' }}>Close</button>

            <div style={{ marginTop: '20px' }}>
                <h4>Unique to {locationName1} ({uniqueToPoint1.length})</h4>
                <ul>
                    {uniqueToPoint1.map(specie => (
                        <li key={specie}>{specie}</li>
                    ))}
                </ul>
            </div>

            <div style={{ marginTop: '20px' }}>
                <h4>Unique to {locationName2} ({uniqueToPoint2.length})</h4>
                <ul>
                    {uniqueToPoint2.map(specie => (
                        <li key={specie}>{specie}</li>
                    ))}
                </ul>
            </div>

            <div style={{ marginTop: '20px' }}>
                <h4>Common Birds ({commonBirds.length})</h4>
                <ul>
                    {commonBirds.map(specie => (
                        <li key={specie}>{specie}</li>
                    ))}
                </ul>
            </div>

            <div style={{
                textAlign: 'center',
                marginTop: '20px',
                paddingBottom: '10px'
            }}>
                <button
                    onClick={scrollToTop}
                    style={{
                        backgroundColor: '#4ecdc4',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Scroll to Top
                </button>
            </div>
        </div>
    );
};

export default ComparisonResults;