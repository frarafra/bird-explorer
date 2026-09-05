import { useCallback } from "react";

import { MapEventsHandlerProps } from "../../types";

const useMapState = (
  map: L.Map,
  onMoveEnd: MapEventsHandlerProps["onMoveEnd"],
  setMapDist: MapEventsHandlerProps["setMapDist"],
  setMapZoom: MapEventsHandlerProps["setMapZoom"]
) => {
  const getMapState = useCallback(() => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const radiusMeters = map.distance(center, bounds.getNorthEast());
    const dist = Math.max(
      5,
      Math.ceil(radiusMeters / 1000)
    );

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

