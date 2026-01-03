'use client';

import React, { useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import CopyToClipboard from 'react-copy-to-clipboard';

import { BirdContext } from '../contexts/BirdContext';
import SearchBox from '../components/SearchBox';
import SearchResults from '../components/SearchResults';
import { MapCenter, Result } from '../types';
import MainLayout from '../layouts/MainLayout';

const Map = dynamic(() => import('../components/Map'), {
    ssr: false,
});

const ShareButton = ({ mapCenter, species }: { mapCenter: MapCenter; species?: string }) => {
    const isInitialMount = useRef(true);

    useEffect(() => {
            if (isInitialMount.current) { 
                isInitialMount.current = false; 
                return; 
            }
    }, []);

    const getShareableLink = () => {
        if (typeof window !== 'undefined') {
            return `${window.location.origin}?lat=${mapCenter.lat}&lng=${mapCenter.lng}${species ? `&species=${species}` : ''}`;
        }
        return '';
    };

    return (
        <CopyToClipboard text={getShareableLink()} onCopy={() => alert('Link copied to clipboard!')}>
            <button>Share link</button>
        </CopyToClipboard>
    );
};

const HomePage = () => {
    const router = useRouter();
    const { lat: latParam, lng: lngParam, species } = router.query;

    const { birds, setBirds, observations, setObservations, mapCenter, setMapCenter, setTaxonomies } = useContext(BirdContext);
    const [hoveredResultId, setHoveredResultId] = useState<number | null>(null);
    const isInitialMount = useRef(true);

    const { lat, lng } = mapCenter;
    
    const fetchBirds = async (newLat?: string, newLng?: string) => {
        try {
            const response = await fetch(`/api/ebirdSpeciesSearch?lat=${newLat}&lng=${newLng}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch birds: ${response.statusText}`);
            }

            const birds = await response.json();
            
            setBirds(birds.reduce((acc: Record<string, string>, obs: any) => {
                acc[obs.comName.toLowerCase()] = obs.speciesCode;
                return acc;
            }, {}));
        } catch (error) {
            console.error('Error fetching birds:', error);
        }
    };

    const fetchTaxonomies = async (speciesCodes: string[]) => {
        try {
            const response = await fetch(`/api/taxonomy/species?speciesCodes=${speciesCodes.join(',')}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch taxonomies: ${response.statusText}`);
            }

            const taxonomies = await response.json();
            
            setTaxonomies(taxonomies);
        } catch (error) {
            console.error('Error fetching taxonomies:', error);
        }
    };
    
    const getBirdObservations = async (bird: string) => {
        if (!bird ||!mapCenter.lat || !mapCenter.lng) return;

        const lat = latParam as string || mapCenter.lat.toString();
        const lng = lngParam as string || mapCenter.lng.toString();
        let nearObservations = [];
        try {
            const response = await fetch(`/api/ebirdObservations?bird=${bird}&lat=${lat}&lng=${lng}`);
            nearObservations = await response.json();
        } catch (error) {
            console.error(error);
        }
        setObservations(nearObservations);
    };
    
    const handleSearch = async (bird: string) => {
        getBirdObservations(bird);
    };

    const setMapCenterFromQueryParams = (lat: string | undefined, lng: string | undefined) => {
        if (lat && lng) {
            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);
            setMapCenter({ lat: parsedLat, lng: parsedLng });
        }
    };

    useEffect(() => {
        setMapCenterFromQueryParams(latParam as string, lngParam as string);
    }, [latParam, lngParam]);

    useEffect(() => {
        fetchBirds(lat.toString(), lng.toString());  
    }, [lat, lng]);

    useEffect(() => {
        if (isInitialMount.current) { 
            isInitialMount.current = false; 
            return; 
        }
        const speciesCodes = Object.values(birds);
        if (speciesCodes.length > 0) {
            fetchTaxonomies(speciesCodes);
        }
    }, [birds]);

    useEffect(() => {
        getBirdObservations(species as string);
    }, [species]);

    return (
        <MainLayout shareButton={<ShareButton mapCenter={mapCenter} species={species as string}/>}>
            <div style={{ display: 'flex', height: '100vh' }}>
                <div style={{ flex: 2, paddingRight: '20px' }}>
                    <SearchBox onSearch={handleSearch} />
                    <SearchResults results={observations.slice(0, 10).sort((a: Result, b: Result) => {
                        const aObsDt = Date.parse(a.obsDt);
                        const bObsDt = Date.parse(b.obsDt);
                        if (bObsDt !== aObsDt) {
                            return bObsDt - aObsDt;
                        }
                        return b.howMany - a.howMany;
                    })} setHoveredResultId={setHoveredResultId} />
                </div>
                <div style={{ flex: 3, position: 'relative', height: '100vh' }}>
                    <Map lat={mapCenter.lat} lng={mapCenter.lng} results={observations} hoveredResultId={hoveredResultId} onMoveEnd={setMapCenter} />
                </div>
            </div>
        </MainLayout>
    );
};

export default HomePage;