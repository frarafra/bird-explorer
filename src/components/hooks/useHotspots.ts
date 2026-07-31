import { useCallback, useEffect, useRef } from "react";

import { MapEventsHandlerProps, Hotspot } from "../../types";

const useHotspots = (
  onHotspotsChanged: MapEventsHandlerProps["onHotspotsChanged"]
) => {
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const lastFetchRef = useRef<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);

  const fetchHotspots = useCallback(
    async (center: L.LatLng, zoom: number, dist: number) => {
      if (dist > 50) {
        abortRef.current?.abort();
        abortRef.current = null;

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

      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      const requestId = ++requestIdRef.current;

      try {
        const response = await fetch(
          `/api/ebirdHotspots?lat=${center.lat}&lng=${center.lng}&dist=${dist}`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch hotspots");
        }

        const hotspots: Hotspot[] = await response.json();

        if (requestId !== requestIdRef.current) {
          return;
        }

        lastFetchRef.current = {
          lat: center.lat,
          lng: center.lng,
          zoom,
        };

        onHotspotsChanged(
          hotspots.filter((h) => h.latestObsDt !== null)
        );
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error(err);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [onHotspotsChanged]
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return fetchHotspots;
};

export default useHotspots;
