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

    const dist = Math.max(
      5,
      Math.ceil(Math.abs(bounds.getNorth() - center.lat) * 111)
    );

    onMoveEnd({
      lat: center.lat,
      lng: center.lng,
    });

    setMapZoom(zoom);
    setMapDist(Math.min(dist, 50));

    return {
      center,
      zoom,
      dist,
    };
  }, [map, onMoveEnd, setMapDist, setMapZoom]);

  return getMapState;
};

export default useMapState;

