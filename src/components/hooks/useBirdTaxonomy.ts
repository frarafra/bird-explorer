import { useMemo, useEffect, useCallback } from 'react';

interface UseBirdTaxonomyProps {
  birds: Record<string, string>;
  taxonomies: Record<string, string>;
  selectedGroup: string;
  setSelectedGroup: (group: string) => void;
  taxonomiesReady?: boolean;
}

export const useBirdTaxonomy = ({
  birds,
  taxonomies,
  selectedGroup,
  setSelectedGroup,
  taxonomiesReady = false,
}: UseBirdTaxonomyProps) => {
  const groups = useMemo(() => {
    const uniqueGroups = new Set<string>();

    Object.values(birds).forEach(speciesCode => {
      const group = taxonomies[speciesCode];

      if (group) {
        uniqueGroups.add(group);
      }
    });

    return [
      'All Groups',
      ...Array.from(uniqueGroups).sort((a, b) =>
        a.localeCompare(b)
      ),
    ];
  }, [birds, taxonomies]);

  useEffect(() => {
    const hasBirds = Object.keys(birds).length > 0;

    if (
      taxonomiesReady &&
      hasBirds &&
      selectedGroup !== 'All Groups' &&
      !groups.includes(selectedGroup)
    ) {
      setSelectedGroup('All Groups');
    }
  }, [birds, groups, selectedGroup, setSelectedGroup, taxonomiesReady]);

  const orderedBirds = useMemo(() => {
    const orderedGroups = Array.from(
      new Set(Object.values(taxonomies))
    ).filter(Boolean);

    const transformNameForSorting = (name: string) =>
      name.split(' ').reverse().join(', ');

    return Object.entries(birds).sort(
      ([name1, code1], [name2, code2]) => {
        const group1 = taxonomies[code1] ?? '';
        const group2 = taxonomies[code2] ?? '';

        if (!group1) return 1;
        if (!group2) return -1;

        const index1 = orderedGroups.indexOf(group1);
        const index2 = orderedGroups.indexOf(group2);

        if (index1 !== index2) {
          return index1 - index2;
        }

        return transformNameForSorting(name1).localeCompare(
          transformNameForSorting(name2)
        );
      }
    );
  }, [birds, taxonomies]);

  const birdsByGroup = useMemo(() => {
    if (selectedGroup === 'All Groups') {
      return orderedBirds;
    }

    return orderedBirds.filter(
      ([, speciesCode]) =>
        taxonomies[speciesCode] === selectedGroup
    );
  }, [orderedBirds, selectedGroup, taxonomies]);

  const groupBirds = useCallback(
    (birdList: [string, string][]) =>
        birdList.reduce<Record<string, [string, string][]>>(
            (acc, bird) => {
                const group =
                    taxonomies[bird[1]] ?? 'Unknown';

                if (!acc[group]) {
                    acc[group] = [];
                }

                acc[group].push(bird);

                return acc;
            },
            {}
        ),
    [taxonomies]
  );

  return {
    groups,
    orderedBirds,
    birdsByGroup,
    groupBirds
  };
};
