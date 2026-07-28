import { useEffect, useState } from 'react';

type UseBirdSimilarityProps = {
    groupedBirds: Record<string, [string, string][]>;
    birdImages: Record<string, string>;
    sortMethod: 'name' | 'similarity' | 'abundance';
};

export function useBirdSimilarity({
    groupedBirds,
    birdImages,
    sortMethod
}: UseBirdSimilarityProps) {
    const [sortedBirds, setSortedBirds] = useState<[string, string][]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const clusterBirds = async (
            birds: [string, string][],
            birdImages: Record<string, string>
        ) => {
            try {
                setSortedBirds([]);
                setIsProcessing(true);

                const response = await fetch(
                    '/api/ebirdSimilarImages',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            birds,
                            birdImages,
                        }),
                    }
                );

                if (!response.ok) {
                    setSortedBirds(birds);
                    return;
                }

                const sortedData: [string, string][] =
                    await response.json();

                setSortedBirds(sortedData);
            } catch (error) {
                console.error('Clustering error:', error);
                setSortedBirds(birds);
            } finally {
                setIsProcessing(false);
            }
        };

        if (
            sortMethod === 'similarity' &&
            Object.keys(groupedBirds).length > 0
        ) {
            const allBirds = Object.values(groupedBirds).flat();

            if (allBirds.length > 0) {
                clusterBirds(allBirds, birdImages);
            }
        }
    }, [birdImages, sortMethod]);

    return {
        sortedBirds,
        setSortedBirds,
        isProcessing,
    };
}
