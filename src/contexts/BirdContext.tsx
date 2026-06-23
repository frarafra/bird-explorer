import {
    createContext,
    FC,
    ReactNode,
    useEffect,
    useState
} from 'react';
import { Result, MapCenter } from '../types';

export type Recording = {
    q?: string;
    type?: string;
};

interface BirdContextType {
    birds: Record<string, string>;
    setBirds: React.Dispatch<React.SetStateAction<Record<string, string>>>;

    birdImages: Record<string, string>;
    setBirdImages: React.Dispatch<React.SetStateAction<Record<string, string>>>;

    recordings: Record<string, Recording[]>;
    setRecordings: React.Dispatch<
        React.SetStateAction<Record<string, Recording[]>>
    >;

    observations: Result[];
    setObservations: React.Dispatch<React.SetStateAction<Result[]>>;

    mapCenter: MapCenter;
    setMapCenter: React.Dispatch<React.SetStateAction<MapCenter>>;

    taxonomies: Record<string, string>;
    setTaxonomies: React.Dispatch<
        React.SetStateAction<Record<string, string>>
    >;

    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;

    pageRec: number;
    setPageRec: React.Dispatch<React.SetStateAction<number>>;

    selectedGroup: string;
    setSelectedGroup: React.Dispatch<React.SetStateAction<string>>;

    selectedSpecies: string;
    setSelectedSpecies: React.Dispatch<React.SetStateAction<string>>;
}

export const BirdContext = createContext<BirdContextType>({
    birds: {},
    setBirds: () => {},

    birdImages: {},
    setBirdImages: () => {},

    recordings: {},
    setRecordings: () => {},

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
    setPage: () => {},

    pageRec: 0,
    setPageRec: () => {},

    selectedGroup: 'All Groups',
    setSelectedGroup: () => {},

    selectedSpecies: 'All Species',
    setSelectedSpecies: () => {}
});

interface BirdProviderProps {
    children: ReactNode;
}

export const BirdProvider: FC<BirdProviderProps> = ({
    children
}) => {
    const [birds, setBirds] = useState<
        Record<string, string>
    >({});

    const [birdImages, setBirdImages] = useState<
        Record<string, string>
    >({});

    const [recordings, setRecordings] = useState<
        Record<string, Recording[]>
    >({});

    const [observations, setObservations] =
        useState<Result[]>([]);

    const [taxonomies, setTaxonomies] = useState<
        Record<string, string>
    >({});

    const [selectedGroup, setSelectedGroup] =
        useState<string>('All Groups');

    const [selectedSpecies, setSelectedSpecies] =
        useState<string>('All Species');

    const [mapCenter, setMapCenter] = useState<MapCenter>({
        lat: parseFloat(
            process.env.NEXT_PUBLIC_LAT || '0'
        ),
        lng: parseFloat(
            process.env.NEXT_PUBLIC_LNG || '0'
        )
    });

    const [page, setPage] = useState(0);

    const [pageRec, setPageRec] = useState(0);


    useEffect(() => {
        setPage(0);
        setPageRec(0);

        setBirdImages({});

        setRecordings({});
    }, [mapCenter]);

    return (
        <BirdContext.Provider
            value={{
                birds,
                setBirds,

                birdImages,
                setBirdImages,

                recordings,
                setRecordings,

                observations,
                setObservations,

                taxonomies,
                setTaxonomies,

                mapCenter,
                setMapCenter,

                page,
                setPage,

                pageRec,
                setPageRec,

                selectedGroup,
                setSelectedGroup,

                selectedSpecies,
                setSelectedSpecies
            }}
        >
            {children}
        </BirdContext.Provider>
    );
};
