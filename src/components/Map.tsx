import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';

import ComparisonResults from './ComparisonResults';
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

const compareIcon = new Leaflet.Icon({
  iconUrl: markerIcon.src ?? '/markers/comparer-icon.png',
  iconSize: [12, 20],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});

const MapClickHandler = ({ onLocationSelected }: { onLocationSelected: (lat: number, lng: number) => void }) => {
  const map = useMapEvents({
    click(e) {
      onLocationSelected(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

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
  const [compareMode, setCompareMode] = useState(false);
  const [point1, setPoint1] = useState<{lat: number, lng: number, species: string[]} | null>(null);
  const [point2, setPoint2] = useState<{lat: number, lng: number, species: string[]} | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);

    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const handleLocationSelected = async (lat: number, lng: number) => {
    if (!compareMode) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/ebirdSpeciesSearch?lat=${lat}&lng=${lng}&dist=10`);
      if (!response.ok) {
        throw new Error(`Failed to fetch birds: ${response.statusText}`);
      }

      const birds = await response.json();
      
      if (!point1) {
        setPoint1({ lat, lng, species: birds.map((b: Result) => b.comName) });
      } else if (!point2) {
        setPoint2({ lat, lng, species: birds.map((b: Result) => b.comName) });
        setShowComparison(true);
        setCompareMode(false);
      }
    } catch (error) {
      console.error('Error fetching species data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetComparison = () => {
    setPoint1(null);
    setPoint2(null);
    setShowComparison(false);
  };

  return (
      <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
          <MapContainer
              center={[lat, lng]}
              zoom={10}
              style={{ height: "100%", width: "100%" }}
          >
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

              {point1 && (
                  <Marker
                      position={[point1.lat, point1.lng]}
                      icon={compareIcon}
                  >
                      <Popup>Point 1: {point1.species ? `${point1.species.length} species` : 'Loading...'}</Popup>
                  </Marker>
              )}

              {point2 && (
                  <Marker
                      position={[point2.lat, point2.lng]}
                      icon={compareIcon}
                  >
                      <Popup>Point 2: {point2.species ? `${point2.species.length} species` : 'Loading...'}</Popup>
                  </Marker>
              )}

              {compareMode && <MapClickHandler onLocationSelected={handleLocationSelected} />}
          </MapContainer>

          <button
              onClick={() => {
                setCompareMode(!compareMode);
                if (!compareMode) {
                  setPoint1(null);
                  setPoint2(null);
                }
              }}
              style={{
                  position: 'absolute',
                  top: isMobile ? 'auto' : '10px',
                  right: isMobile ? 'auto' : '10px',
                  bottom: isMobile ? '40px' : 'auto',
                  left: isMobile ? '50%' : 'auto',
                  transform: isMobile ? 'translateX(-50%)' : 'none',
                  zIndex: 1000,
                  padding: '8px 12px',
                  background: compareMode ? '#ff6b6b' : '#4ecdc4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  width: isMobile ? '90%' : 'auto'
                }}
          >
              {compareMode ? 'Cancel Compare' : 'Compare Locations'}
          </button>

          {showComparison && point1 && point2 && (
              <ComparisonResults
                  point1={point1}
                  point2={point2}
                  onClose={resetComparison}
              />
          )}
      </div>
  );
};

export default Map;