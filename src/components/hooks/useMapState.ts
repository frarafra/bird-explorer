import { useCallback, useRef } from "react";

import { MapEventsHandlerProps } from "../../types";

const roundToThreeDecimals = (value: number) => Math.round(value * 1000) / 1000;

const useMapState = (
  map: L.Map,
  onMoveEnd: MapEventsHandlerProps["onMoveEnd"],
  setMapDist: MapEventsHandlerProps["setMapDist"],
  setMapZoom: MapEventsHandlerProps["setMapZoom"]
) => {
  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null);

  const getMapState = useCallback(() => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const radiusMeters = map.distance(center, bounds.getNorthEast());
    const dist = Math.max(
      5,
      Math.ceil(radiusMeters / 1000)
    );

    const roundedCenter = {
      lat: roundToThreeDecimals(center.lat),
      lng: roundToThreeDecimals(center.lng),
    };

    const hasCenterChanged =
      !lastCenterRef.current ||
      lastCenterRef.current.lat !== roundedCenter.lat ||
      lastCenterRef.current.lng !== roundedCenter.lng;

    if (hasCenterChanged) {
      onMoveEnd({
        lat: roundedCenter.lat,
        lng: roundedCenter.lng,
      });
      lastCenterRef.current = roundedCenter;
    }

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

