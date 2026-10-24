import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type HistoricBird = {
  name: string;
  speciesCode: string;
};

type UseBirdHistoricProps = {
  selectedDates: string[];
  hotspotSubnationalCodes: string[];
  mapBounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  birds: Record<string, string>;
  speciesObserved: any[];
  taxonomies: Record<string, string>;
  contextTaxonomies: Record<string, string>;
  setTaxonomies: React.Dispatch<React.SetStateAction<Record<string, string>>>;
};

export const useBirdHistoric = ({
  selectedDates,
  hotspotSubnationalCodes,
  mapBounds,
  birds,
  speciesObserved,
  taxonomies,
  contextTaxonomies,
  setTaxonomies,
}: UseBirdHistoricProps) => {
  const [historicBirdsByDate, setHistoricBirdsByDate] = useState<
    Record<string, HistoricBird[]>
  >({});
  const [showNoObservationsMessage, setShowNoObservationsMessage] = useState(false);
  const [emptyNoticeVersion, setEmptyNoticeVersion] = useState(0);

  const requestedDatesRef = useRef(new Set<string>());
  const taxonomyRequestRef = useRef(new Set<string>());
  const handledEmptyDatesRef = useRef(new Set<string>());

  useEffect(() => {
    if (!showNoObservationsMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      setShowNoObservationsMessage(false);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [emptyNoticeVersion, showNoObservationsMessage]);

  const fetchMissingTaxonomies = useCallback(
    async (speciesCodes: string[]) => {
      const missingCodes = Array.from(
        new Set(
          speciesCodes.filter(
            (speciesCode) =>
              speciesCode &&
              !(speciesCode in contextTaxonomies) &&
              !taxonomyRequestRef.current.has(speciesCode)
          )
        )
      );

      if (!missingCodes.length) {
        return;
      }

      missingCodes.forEach((speciesCode) => {
        taxonomyRequestRef.current.add(speciesCode);
      });

      try {
        const params = new URLSearchParams({
          speciesCodes: missingCodes.join(','),
        });

        const response = await fetch(
          `/api/taxonomy/species?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch taxonomies: ${response.statusText}`
          );
        }

        const nextTaxonomies = await response.json();

        if (nextTaxonomies && typeof nextTaxonomies === 'object') {
          setTaxonomies((prevTaxonomies) => ({
            ...prevTaxonomies,
            ...nextTaxonomies,
          }));
        }
      } catch (error) {
        console.error('Error fetching missing taxonomies:', error);
      } finally {
        missingCodes.forEach((speciesCode) => {
          taxonomyRequestRef.current.delete(speciesCode);
        });
      }
    },
    [contextTaxonomies, setTaxonomies]
  );

  useEffect(() => {
    if (!selectedDates.length || !hotspotSubnationalCodes.length) {
      setHistoricBirdsByDate({});
      requestedDatesRef.current.clear();
      return;
    }

    let cancelled = false;

    const datesToFetch = selectedDates.filter(
      (date) => !requestedDatesRef.current.has(date)
    );

    if (!datesToFetch.length) {
      return;
    }

    datesToFetch.forEach((date) => {
      requestedDatesRef.current.add(date);
    });

    const loadHistoricBirds = async () => {
      try {
        const results = await Promise.allSettled(
          datesToFetch.map(async (date) => {
            const params = new URLSearchParams({
              date,
              north: String(mapBounds.north),
              south: String(mapBounds.south),
              east: String(mapBounds.east),
              west: String(mapBounds.west),
            });

            hotspotSubnationalCodes.forEach((subnationalCode) => {
              params.append('subnationalCode', subnationalCode);
            });

            const response = await fetch(
              `/api/ebirdHistoricSpeciesSearch?${params.toString()}`
            );

            if (!response.ok) {
              throw new Error(
                `Historic fetch failed for ${hotspotSubnationalCodes.join(', ')} on ${date}`
              );
            }

            const observations = await response.json();
            const birdsForDate = (Array.isArray(observations) ? observations : [])
              .map((observation: any) => ({
                name:
                  observation?.comName ||
                  observation?.sciName ||
                  observation?.speciesCode ||
                  '',
                speciesCode: observation?.speciesCode || '',
              }))
              .filter((bird) => bird.name || bird.speciesCode);

            const dedupedBirds = new Map<string, HistoricBird>();

            birdsForDate.forEach((bird) => {
              const key = bird.speciesCode || bird.name.toLowerCase();

              if (!dedupedBirds.has(key)) {
                dedupedBirds.set(key, bird);
              }
            });

            const birdsForSelectedDate = Array.from(dedupedBirds.values());

            if (!cancelled) {
              setHistoricBirdsByDate((previous) => ({
                ...previous,
                [date]: birdsForSelectedDate,
              }));

              if (
                birdsForSelectedDate.length === 0 &&
                !handledEmptyDatesRef.current.has(date)
              ) {
                handledEmptyDatesRef.current.add(date);
                setShowNoObservationsMessage(true);
                setEmptyNoticeVersion((version) => version + 1);
              }
            }

            return date;
          })
        );

        if (cancelled) {
          return;
        }

        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            requestedDatesRef.current.delete(datesToFetch[index]);
          }
        });
      } catch (error) {
        console.error('Failed to load historical birds:', error);
      } finally {
        if (cancelled) {
          datesToFetch.forEach((date) => {
            requestedDatesRef.current.delete(date);
          });
        }
      }
    };

    void loadHistoricBirds();

    return () => {
      cancelled = true;
    };
  }, [
    selectedDates,
    hotspotSubnationalCodes,
    mapBounds.north,
    mapBounds.south,
    mapBounds.east,
    mapBounds.west,
  ]);

  const allHistoricBirds = useMemo(
    () => {
      if (!selectedDates.length) {
        return [] as HistoricBird[];
      }

      const selectedBirds = selectedDates.flatMap(
        (date) => historicBirdsByDate[date] ?? []
      );

      return Array.from(
        new Map(
          selectedBirds.map((bird) => {
            const speciesKey = bird.speciesCode || bird.name.toLowerCase();
            return [speciesKey, bird] as const;
          })
        ).values()
      );
    },
    [historicBirdsByDate, selectedDates]
  );

  const historicSpeciesLookup = useMemo(() => {
    const map = new Map<string, string>();

    Object.entries(birds).forEach(([name, speciesCode]) => {
      if (name) {
        map.set(name.trim().toLowerCase(), speciesCode);
      }
    });

    speciesObserved.forEach((obs: any) => {
      if (obs?.speciesCode) {
        if (obs?.comName) {
          map.set(obs.comName.trim().toLowerCase(), obs.speciesCode);
        }

        if (obs?.sciName) {
          map.set(obs.sciName.trim().toLowerCase(), obs.speciesCode);
        }
      }
    });

    return map;
  }, [birds, speciesObserved]);

  useEffect(() => {
    const missingSpeciesCodes = Array.from(
      new Set(
        [...Object.values(birds), ...allHistoricBirds.map((bird) => bird.speciesCode)]
          .filter(
            (speciesCode): speciesCode is string =>
              Boolean(speciesCode) && !(speciesCode in contextTaxonomies)
          )
      )
    );

    if (!missingSpeciesCodes.length) {
      return;
    }

    void fetchMissingTaxonomies(missingSpeciesCodes);
  }, [allHistoricBirds, birds, contextTaxonomies, fetchMissingTaxonomies]);

  return {
    historicBirdsByDate,
    allHistoricBirds,
    historicSpeciesLookup,
    showNoObservationsMessage,
    effectiveTaxonomies: { ...taxonomies, ...contextTaxonomies },
  };
};
