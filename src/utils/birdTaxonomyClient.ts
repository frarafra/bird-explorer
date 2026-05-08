export interface BirdTaxonomy {
    common_name: string;
    category?: string;
    [key: string]: any;
}

export interface FetchBirdsTaxonomyResponse {
    birds: BirdTaxonomy[];
    keywordsMap: Record<string, Set<string>>;
    birdKeywords?: Record<string, string[]>;
}

export const fetchBirdsFilters = async (
    commonNames: string[]
): Promise<FetchBirdsTaxonomyResponse> => {
    if (!commonNames || commonNames.length === 0) {
        return { birds: [], keywordsMap: {} };
    }

    console.log('Fetching taxonomy for:', commonNames);

    try {
        const response = await fetch('/api/getBirdsTags', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ commonNames }),
        });

        console.log('API response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API error response:', errorText);
            try {
                const error = JSON.parse(errorText);
                throw new Error(error.error || `Failed to fetch bird data: ${response.status}`);
            } catch {
                throw new Error(`Failed to fetch bird data: ${response.status} - ${errorText.substring(0, 100)}`);
            }
        }

        const data = await response.json();
        console.log('API response data:', data);

        return data;
    } catch (error) {
        console.error('Error fetching bird taxonomy:', error);
        throw error;
    }
};
