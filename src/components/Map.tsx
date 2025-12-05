import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Leaflet from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';

import { Result } from '../types';

interface MapProps {
    lat: number;
    lng: number;
    results: Result[];
    hoveredResultId: number | null;
    onMoveEnd: (newCenter: {lat: number, lng: number}) => void; 
}

const mapIcon = new Leaflet.Icon({
  iconUrl: markerIcon.src ?? '/markers/marker-icon.png',
  iconSize: [12, 20],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});

const highlightedMapIcon = new Leaflet.Icon({
  iconUrl: markerIcon.src ?? '/markers/marker-icon.png',
  iconSize: [25, 41], // Bigger size
  iconAnchor: [15, 40],
  popupAnchor: [0, -40]
});

const MapEventsHandler = ({ onMoveEnd }: { onMoveEnd: (newCenter: { lat: number, lng: number }) => void }) => {
  const map = useMap();

  useEffect(() => {
    const handleMoveEnd = () => {
      const center = map.getCenter();
      onMoveEnd({ lat: center.lat, lng: center.lng });
    };

    if (map) {
      map.on('moveend', handleMoveEnd);
    }

    return () => {
      if (map) {
        map.off('moveend', handleMoveEnd);
      }
    };
  }, [map, onMoveEnd]);

  return null;
};
  
const Map: React.FC<MapProps> = ({ lat, lng, results, hoveredResultId, onMoveEnd }) => {
  return (
      <MapContainer center={[lat, lng]} zoom={10} style={{ height: "100%", width: "100%" }}>
          <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {results.map((result: Result) => (
              <Marker
                  key={result.id}
                  position={[result.lat, result.lng]}
                  icon={hoveredResultId === result.subId ? highlightedMapIcon : mapIcon} // Use the highlighted icon when hovering over a marker
              > 
                  <Popup>
                      {result.locName}
                  </Popup>
              </Marker>
          ))}
            <MapEventsHandler onMoveEnd={onMoveEnd} />
      </MapContainer>
  );
};

export default Map;