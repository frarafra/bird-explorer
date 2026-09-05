import { useCallback, useRef } from "react";

import { MapEventsHandlerProps } from "../../types";

const useMapState = (
  map: L.Map,
  onMoveEnd: MapEventsHandlerProps["onMoveEnd"],
  setMapDist: MapEventsHandlerProps["setMapDist"],
  setMapZoom: MapEventsHandlerProps["setMapZoom"]
) => {
  const previousDistRef = useRef<number | null>(null);

  const getMapState = useCallback(() => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const radiusMeters = map.distance(center, bounds.getNorthEast());
    const rawDist = Math.max(
      5,
      Math.ceil(radiusMeters / 1000)
    );
    const prevDist = previousDistRef.current ?? rawDist;
    const dist = Math.max(
      5,
      Math.round(prevDist * 0.6 + rawDist * 0.4)
    );

    previousDistRef.current = dist;

    onMoveEnd({
      lat: center.lat,
      lng: center.lng,
    });

    setMapZoom(zoom);
    setMapDist(dist);

    return {
      center,
      zoom,
      dist,
    };
  }, [map, onMoveEnd, setMapDist, setMapZoom]);

  return getMapState;
};

export default useMapState;

