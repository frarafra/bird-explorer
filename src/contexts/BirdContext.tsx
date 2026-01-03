import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import { Result, MapCenter } from '../types';

interface BirdContextType {
    birds: Record<string, string>;
    setBirds: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    birdImages: Record<string, string>;
    setBirdImages: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    observations: Result[];
    setObservations: React.Dispatch<React.SetStateAction<Result[]>>;
    mapCenter: MapCenter;
    setMapCenter: React.Dispatch<React.SetStateAction<MapCenter>>;
    taxonomies: Record<string, string>;
    setTaxonomies: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
}

export const BirdContext = createContext<BirdContextType>({
    birds: {},
    setBirds: () => {},
    birdImages: {},
    setBirdImages: ()=> {},
    observations: [],
    setObservations: () => {},
    taxonomies: {},
    setTaxonomies: () => {},
    mapCenter: {
        lat: parseFloat(process.env.NEXT_PUBLIC_LAT || '0'),
        lng: parseFloat(process.env.NEXT_PUBLIC_LNG || '0')
    },
    setMapCenter: () => {},
    page: 0,
    setPage: () => {}
});

interface BirdProviderProps {
    children: ReactNode;
}

export const BirdProvider: FC<BirdProviderProps> = ({ children }) => {
    const [birds, setBirds] = useState<Record<string, string>>({});
    const [birdImages, setBirdImages] = useState<Record<string, string>>({});
    const [observations, setObservations] = useState<Result[]>([]);
    const [taxonomies, setTaxonomies] = useState<Record<string, string>>({});
    const [mapCenter, setMapCenter] = useState<{
        lat: number;
        lng: number;
    }>({
        lat: parseFloat(process.env.NEXT_PUBLIC_LAT || '0'),
        lng: parseFloat(process.env.NEXT_PUBLIC_LNG || '0')
    });
    const [page, setPage] = useState(0);
    
    useEffect(() => {
        setPage(0);
        setBirdImages({});
    }, [mapCenter])

    return (
        <BirdContext.Provider value={{ birds, setBirds, birdImages, setBirdImages, 
            observations, setObservations,taxonomies, setTaxonomies, mapCenter, setMapCenter, page, setPage }}>
            {children}
        </BirdContext.Provider>
    );
};