import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

type BirdEntry = [string, string];

type AbundanceResponse = {
    birds?: Array<{
        speciesCode: string;
        total: number;
        rate: number;
    }>;
};

type UseBirdAbundanceProps = {
    filteredBirds: BirdEntry[];
    paginatedBirds: BirdEntry[];
    selectedGroup: string;
    lat: number;
    lng: number;
};

export function useBirdAbundance({
    filteredBirds,
    paginatedBirds,
    selectedGroup,
    lat,
    lng,
}: UseBirdAbundanceProps) {
    const speciesCodes = useMemo(() => {
        const activeBirds =
            selectedGroup === 'All Groups'
                ? paginatedBirds
                : filteredBirds;

        return activeBirds
            .map(([, speciesCode]) => speciesCode)
            .filter(Boolean);
    }, [filteredBirds, paginatedBirds, selectedGroup]);

    const { data, isLoading, error } = useQuery({
        queryKey: [
            'birdAbundance',
            selectedGroup,
            speciesCodes,
            lat,
            lng,
        ],
        queryFn: async (): Promise<AbundanceResponse> => {
            const params = new URLSearchParams({
                species: speciesCodes.join(','),
                lat: String(lat),
                lng: String(lng),
            });

            const response = await fetch(
                `/api/ebirdHowMany?${params.toString()}`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch abundance data');
            }

            return response.json();
        },
        enabled:
            selectedGroup !== 'All Groups' &&
            speciesCodes.length > 0,
        staleTime: 1000 * 60 * 5,
    });

    const abundanceBySpeciesCode = useMemo(() => {
        return (data?.birds ?? []).reduce<
            Record<string, { total: number; rate: number }>
        >((acc, bird) => {
            acc[bird.speciesCode] = {
                total: bird.total,
                rate: bird.rate,
            };

            return acc;
        }, {});
    }, [data]);

    const abundanceSortedBirds = useMemo(() => {
        return [...filteredBirds].sort((a, b) => {
            const totalA =
                abundanceBySpeciesCode[a[1]]?.total ?? 0;
            const totalB =
                abundanceBySpeciesCode[b[1]]?.total ?? 0;

            if (totalA !== totalB) {
                return totalB - totalA;
            }

            return a[0].localeCompare(b[0]);
        });
    }, [filteredBirds, abundanceBySpeciesCode]);

    const getAbundanceIcon = (rate: number) => {
        const filledBars = Math.max(0, Math.min(4, rate));

        return {
            filledBars,
            label:
                rate === 4
                    ? 'Very high abundance'
                    : rate === 3
                    ? 'High abundance'
                    : rate === 2
                    ? 'Medium abundance'
                    : rate === 1
                    ? 'Low abundance'
                    : 'No abundance',
        };
    };

    return {
        abundanceBySpeciesCode,
        abundanceSortedBirds,
        getAbundanceIcon,
        isLoading,
        error,
    };
}
