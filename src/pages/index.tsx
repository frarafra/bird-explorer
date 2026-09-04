'use client';

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import CopyToClipboard from 'react-copy-to-clipboard';

import { BirdContext } from '../contexts/BirdContext';
import SearchBox from '../components/SearchBox';
import SearchResults from '../components/SearchResults';
import { MapCenter, Result } from '../types';
import MainLayout from '../layouts/MainLayout';
import ShareButton from '../components/ShareButton';

const Map = dynamic(() => import('../components/Map'), {
    ssr: false,
});

const HomePage = () => {
    const router = useRouter();
    const { lat: latParam, lng: lngParam, zoom: zoomParam, species, extended } = router.query;

    const { setBirds, setBirdImages, observations, setObservations, mapCenter, setMapCenter, mapDist, setMapDist, mapZoom, setMapZoom, setTaxonomies, setTaxonomiesReady } = useContext(BirdContext);
    const [hoveredResultId, setHoveredResultId] = useState<number | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const { lat, lng } = mapCenter;
    
    const fetchTaxonomies = async (speciesCodes: string[]) => {
        try {
            const timestamp = new Date().getTime();
            const response = await fetch(`/api/taxonomy/species?speciesCodes=${speciesCodes.join(',')}&_=${timestamp}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch taxonomies: ${response.statusText}`);
            }

            const taxonomies = await response.json();

            setTaxonomies(taxonomies);
            setTaxonomiesReady(true);
        } catch (error) {
            console.error('Error fetching taxonomies:', error);
        }
    };

    const fetchBirds = useCallback(async (lat: number, lng: number, mapDist: number) => {
        controllerRef.current?.abort();

        const controller = new AbortController();
        controllerRef.current = controller;

        setBirdImages({});
        setTaxonomies({});
        setTaxonomiesReady(false);

        try {
            const response = await fetch(
                `/api/ebirdSpeciesSearch?lat=${lat}&lng=${lng}&dist=${mapDist}&_=${Date.now()}`,
                { signal: controller.signal }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch birds: ${response.statusText}`);
            }

            const birds = await response.json();

            if (controller.signal.aborted) return;

            const birdsMap: Record<string, string> = birds.reduce((acc: Record<string, string>, obs: any) => {
                acc[obs.comName.toLowerCase()] = obs.speciesCode;
                return acc;
            }, {})

            setBirds(birdsMap);

            const speciesCodes = Object.values(birdsMap);
            if (speciesCodes.length > 0) {
                setTaxonomies({});
                setTaxonomiesReady(false);
                await fetchTaxonomies(speciesCodes);
            }
        } catch (error: any) {
            if (error.name !== "AbortError") {
                console.error("Error fetching birds:", error);
            }
        }
    }, [fetchTaxonomies]);
   
    const getBirdObservations = async (bird: string) => {
        if (!bird ||!mapCenter.lat || !mapCenter.lng) return;

        const lat = latParam as string || mapCenter.lat.toString();
        const lng = lngParam as string || mapCenter.lng.toString();
        const timestamp = new Date().getTime();
        let nearObservations = [];
        try {
            const response = await fetch(`/api/ebirdObservations?bird=${bird}&lat=${lat}&lng=${lng}&_=${timestamp}`);
            nearObservations = await response.json();
        } catch (error) {
            console.error(error);
        }
        setObservations(nearObservations);
    };
    
    const handleSearch = async (bird: string) => {
        getBirdObservations(bird);
    };

    const setMapCenterFromQueryParams = (lat: string | undefined, lng: string | undefined, zoom: string | undefined) => {
        if (lat && lng && zoom) {
            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);
            const parsedZoom = parseInt(zoom, 10);
            setMapCenter({ lat: parsedLat, lng: parsedLng });
            setMapDist(25);
            setMapZoom(parsedZoom);
        }
    };

    useEffect(() => {
        setMapCenterFromQueryParams(latParam as string, lngParam as string, zoomParam as string);
    }, [latParam, lngParam, zoomParam]);

    useEffect(() => {
        fetchBirds(lat, lng, mapDist);
    }, [lat, lng, mapDist]);

    useEffect(() => {
        getBirdObservations(species as string);
    }, [species]);

    return (
        <MainLayout shareButton={<ShareButton mapCenter={mapCenter} mapZoom={mapZoom} species={species as string}/>}>
            <div className="flex h-[100dvh]">
                <div className="flex flex-[2] flex-col pr-5 overflow-hidden">
                    <SearchBox onSearch={handleSearch} />
                    <div className="flex-1 overflow-y-auto">
                        <SearchResults results={observations.slice(0, 10).sort((a: Result, b: Result) => {
                            const aObsDt = Date.parse(a.obsDt);
                            const bObsDt = Date.parse(b.obsDt);
                            if (bObsDt !== aObsDt) {
                                return bObsDt - aObsDt;
                            }
                            return b.howMany - a.howMany;
                        })} setHoveredResultId={setHoveredResultId} />
                    </div>
                </div>
                <div className="relative min-h-0 flex-[3]">
                    <Map extended={extended === 'true'} lat={mapCenter.lat} lng={mapCenter.lng} results={observations} hoveredResultId={hoveredResultId}  />
                </div>
            </div>
        </MainLayout>
    );
};

export default HomePage;