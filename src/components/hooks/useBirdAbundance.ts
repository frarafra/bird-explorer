import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type BirdEntry = [string, string];

type AbundanceResponse = {
    birds: Array<{
        speciesCode: string;
        total: number;
        rate: number;
    }>;
};

type StreamMessage =
    | { type: 'bird'; bird: AbundanceResponse['birds'][number] }
    | { type: 'complete' }
    | { type: 'error'; message: string };

function isStreamMessage(value: unknown): value is StreamMessage {
    if (!value || typeof value !== 'object' || !('type' in value)) {
        return false;
    }

    if (value.type === 'bird') {
        return (
            'bird' in value &&
            typeof value.bird === 'object' &&
            value.bird !== null &&
            'speciesCode' in value.bird &&
            typeof value.bird.speciesCode === 'string' &&
            'total' in value.bird &&
            typeof value.bird.total === 'number' &&
            'rate' in value.bird &&
            typeof value.bird.rate === 'number'
        );
    }

    if (value.type === 'complete') {
        return true;
    }

    return value.type === 'error' && 'message' in value && typeof value.message === 'string';
}

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
    const queryClient = useQueryClient();
    const speciesCodes = useMemo(() => {
        const activeBirds =
            selectedGroup === 'All Groups'
                ? paginatedBirds
                : filteredBirds;

        return activeBirds
            .map(([, speciesCode]) => speciesCode)
            .filter(Boolean);
    }, [filteredBirds, paginatedBirds, selectedGroup]);

    const queryKey = [
        'birdAbundance',
        selectedGroup,
        speciesCodes,
        lat,
        lng,
    ];

    const { data, isLoading, error } = useQuery({
        queryKey,
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

            if (!response.body) {
                throw new Error('Abundance response does not support streaming');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            const birds: AbundanceResponse['birds'] = [];
            let buffer = '';
            let completed: AbundanceResponse | undefined;

            const processLine = (line: string) => {
                if (!line.trim()) {
                    return;
                }
                if (completed) {
                    throw new Error('Abundance stream sent data after completion');
                }

                const parsed: unknown = JSON.parse(line);
                if (!isStreamMessage(parsed)) {
                    throw new Error('Invalid abundance stream message');
                }

                if (parsed.type === 'error') {
                    throw new Error(parsed.message);
                }

                if (parsed.type === 'bird') {
                    birds.push(parsed.bird);
                    queryClient.setQueryData<AbundanceResponse>(queryKey, {
                        birds: [...birds],
                    });
                    return;
                }
                completed = {
                    birds: [...birds],
                };
                queryClient.setQueryData<AbundanceResponse>(queryKey, completed);
            };

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    buffer += decoder.decode(value, { stream: !done });

                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    lines.forEach(processLine);

                    if (done) {
                        break;
                    }
                }

                processLine(buffer);
            } catch (error) {
                try {
                    await reader.cancel();
                } catch (cancelError) {
                    console.error('Failed to cancel abundance response stream:', cancelError);
                }
                throw error;
            } finally {
                reader.releaseLock();
            }

            if (!completed) {
                throw new Error('Abundance stream ended before completion');
            }

            return completed;
        },
        enabled:
            selectedGroup !== 'All Groups' &&
            speciesCodes.length > 0,
        staleTime: 1000 * 60 * 5,
    });

    const abundanceBySpeciesCode = useMemo(() => {
        return data?.birds.reduce<
            Record<string, { total: number; rate: number }>
        >((acc, bird) => {
            acc[bird.speciesCode] = {
                total: bird.total,
                rate: bird.rate,
            };

            return acc;
        }, {}) ?? {};
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
