import { useCallback, useEffect, useRef } from "react";

import { MapEventsHandlerProps, Hotspot } from "../../types";

const useHotspots = (
  onHotspotsChanged: MapEventsHandlerProps["onHotspotsChanged"]
) => {
  const abortRef = useRef<AbortController | null>(null);

  const lastFetchRef = useRef<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);

  const fetchHotspots = useCallback(
    async (
      center: L.LatLng,
      zoom: number,
      dist: number
    ) => {
      if (dist > 50) {
        onHotspotsChanged([]);
        return;
      }

      if (lastFetchRef.current) {
        const movedEnough =
          Math.abs(center.lat - lastFetchRef.current.lat) > 0.02 ||
          Math.abs(center.lng - lastFetchRef.current.lng) > 0.02;

        const zoomChanged = zoom !== lastFetchRef.current.zoom;

        if (!movedEnough && !zoomChanged) {
          return;
        }
      }

      lastFetchRef.current = {
        lat: center.lat,
        lng: center.lng,
        zoom,
      };

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const response = await fetch(
          `/api/ebirdHotspots?lat=${center.lat}&lng=${center.lng}&dist=${dist}`,
          {
            signal: abortRef.current.signal,
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch hotspots");
        }

        const hotspots: Hotspot[] = await response.json();

        onHotspotsChanged(
          hotspots.filter(h => h.latestObsDt !== null)
        );
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error(err);
        }
      }
    },
    [onHotspotsChanged]
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  return fetchHotspots;
};

export default useHotspots;
