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
    const response = await fetch(`/api/reverseGeocode?lat=${lat}&lng=${lng}`);
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
            className="fixed left-1/2 top-1/2 z-[1000] max-h-[80%] max-w-[80%] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_0_10px_rgba(0,0,0,0.3)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
            <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold">Comparison Results</h3>
                <button
                    onClick={onClose}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white"
                >
                    Close
                </button>
            </div>

            <div className="mt-5">
                <h4 className="text-base font-semibold">Unique to {locationName1} ({uniqueToPoint1.length})</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                    {uniqueToPoint1.map(specie => (
                        <li key={specie}>{specie}</li>
                    ))}
                </ul>
            </div>

            <div className="mt-5">
                <h4 className="text-base font-semibold">Unique to {locationName2} ({uniqueToPoint2.length})</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                    {uniqueToPoint2.map(specie => (
                        <li key={specie}>{specie}</li>
                    ))}
                </ul>
            </div>

            <div className="mt-5">
                <h4 className="text-base font-semibold">Common Birds ({commonBirds.length})</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
                    {commonBirds.map(specie => (
                        <li key={specie}>{specie}</li>
                    ))}
                </ul>
            </div>

            <div className="mt-5 pb-2 text-center">
                <button
                    onClick={scrollToTop}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white"
                >
                    Scroll to Top
                </button>
            </div>
        </div>
    );
};

export default ComparisonResults;