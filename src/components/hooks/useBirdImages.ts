import { useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BirdContext } from '../../contexts/BirdContext';

interface BirdData {
  name: string;
  imageUrl: string;
}

interface UseBirdImagesProps {
  birds: [string, string][];
  selectedGroup: string;
  setSelectedGroup: (group: string) => void;
}

export const useBirdImages = ({
  birds,
  selectedGroup,
  setSelectedGroup,
}: UseBirdImagesProps) => {
  const { setBirdImages, page, taxonomiesReady } = useContext(BirdContext);

  const batchSize = Number(process.env.NEXT_PUBLIC_BATCH_SIZE);

  // Warm up lambda once
  useEffect(() => {
    const warmUpLambda = async () => {
      try {
        const response = await fetch('/api/ebirdSimilarImages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            birds: ['ou'],
            birdImages: {
              ou: process.env.NEXT_PUBLIC_EBIRD_IMAGE_URL,
            },
          }),
        });

        if (!response.ok) {
          console.error(
            'Warm-up failed:',
            response.status,
            response.statusText
          );
        }
      } catch (error) {
        console.error('Unexpected warm-up error:', error);
      }
    };

    warmUpLambda();
  }, []);

  const query = useQuery({
    queryKey: [
      'birdImages',
      selectedGroup,
      page,
      birds.length,
    ],
    queryFn: async () => {
      if (birds.length === 0) {
        setSelectedGroup('All Groups');
        return [];
      }

      const batch =
        selectedGroup === 'All Groups'
          ? birds
              .slice(
                page * batchSize,
                (page + 1) * batchSize
              )
              .reduce((acc, [name, code]) => {
                acc[name] = code;
                return acc;
              }, {} as Record<string, string>)
          : birds.reduce((acc, [name, code]) => {
              acc[name] = code;
              return acc;
            }, {} as Record<string, string>);

      if (Object.keys(batch).length === 0) {
        return [];
      }

      const response = await fetch('/api/ebirdImages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch bird images');
      }

      return response.json();
    },
    enabled: birds.length > 0 && taxonomiesReady,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!query.data) return;

    setBirdImages(prev => ({
      ...prev,
      ...query.data.reduce(
        (acc: Record<string, string>, bird: BirdData) => {
          acc[bird.name] = bird.imageUrl;
          return acc;
        },
        {}
      ),
    }));
  }, [query.data, setBirdImages]);

  return query;
};
