import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';

import ComparisonResults from './ComparisonResults';
import { Result } from '../types';
import { calculateBounds } from '../utils/mapUtils';

interface MapProps {
    extended: boolean;
    lat: number;
    lng: number;
    results: Result[];
    hoveredResultId: number | null;
    onMoveEnd: (newCenter: {lat: number, lng: number}) => void; 
}

interface Hotspot {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  latestObsDt: string;
}

interface MapEventsHandlerProps {
  onMoveEnd: (newCenter: { lat: number; lng: number }) => void;
  onHotspotsChanged: (hotspots: Hotspot[]) => void;
}

const mapIcon = new Leaflet.Icon({
  iconUrl: markerIcon.src ?? '/markers/marker-icon.png',
  iconSize: [12, 20],
  iconAnchor: [7, 7],
  popupAnchor: [0, -7],
  tooltipAnchor: [16, -28]
});

const highlightedMapIcon = new Leaflet.Icon({
  iconUrl: markerIcon.src ?? '/markers/marker-icon.png',
  iconSize: [25, 41], // Bigger size
});

const compareIcon = new Leaflet.Icon({
  iconUrl: markerIcon.src ?? '/markers/comparer-icon.png',
  iconSize: [12, 20],
  iconAnchor: [7, 7],
});

const MapClickHandler = ({ onLocationSelected }: { onLocationSelected: (lat: number, lng: number) => void }) => {
  const map = useMapEvents({
    click(e) {
      onLocationSelected(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
};

const MapEventsHandler = ({ onMoveEnd, onHotspotsChanged }: MapEventsHandlerProps) => {
  const map = useMap();

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const lastFetchRef = useRef<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    const fetchHotspots = async () => {
      const center = map.getCenter();
      const zoom = map.getZoom();

      onMoveEnd({
        lat: center.lat,
        lng: center.lng,
      });

      if (lastFetchRef.current) {
        const movedLat = Math.abs(center.lat - lastFetchRef.current.lat);
        const movedLng = Math.abs(center.lng - lastFetchRef.current.lng);

        const movedEnough = movedLat > 0.02 || movedLng > 0.02;
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
        const bounds = map.getBounds();
        const north = bounds.getNorth();

        const dist = Math.max(
          5,
          Math.ceil(Math.abs(north - center.lat) * 111)
        );
        
        if (dist > 50) {
          onHotspotsChanged([]);
          return;
        }

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
        onHotspotsChanged([...hotspots.filter(h => h.latestObsDt !== null)]);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Error loading hotspots:", err);
        }
      }
    };

    const handleMoveEnd = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(fetchHotspots, 500);
    };

    fetchHotspots();

    map.on("moveend", handleMoveEnd);

    return () => {
      map.off("moveend", handleMoveEnd);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      abortRef.current?.abort();
    };
  }, [map, onMoveEnd, onHotspotsChanged]);

  return null;
};

const UpdateMapView = ({ lat, lng, extended }: { lat: number; lng: number; extended: boolean }) => {
  const map = useMap();
  useEffect(() => {
    if (!extended) {
      map.setView([lat, lng], map.getZoom());
    }
  }, [lat, lng, map, extended]);
  return null;
};

const FitBounds = ({ bounds }: { bounds: [[number, number], [number, number]] | null }) => {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [bounds, map]);

  return null;
};
  
const Map: React.FC<MapProps> = ({ extended, lat, lng, results, hoveredResultId, onMoveEnd }) => {
  const [compareMode, setCompareMode] = useState(false);
  const [point1, setPoint1] = useState<{lat: number, lng: number, species: string[]} | null>(null);
  const [point2, setPoint2] = useState<{lat: number, lng: number, species: string[]} | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [bounds, setBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);

    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  useEffect(() => {
    setBounds(calculateBounds(results));
  }, [results]);

  const handleLocationSelected = async (lat: number, lng: number) => {
    if (!compareMode) return;

    setIsLoading(true);
    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/ebirdSpeciesSearch?lat=${lat}&lng=${lng}&dist=10&_=${timestamp}`);
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
              {...(!extended ? { center: [lat, lng], zoom: 10 } : {})}
              style={{ height: "100%", width: "100%" }}
          >
              <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {extended && <FitBounds bounds={bounds} />}
              <UpdateMapView lat={lat} lng={lng} extended={extended} />

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

              <MapEventsHandler onMoveEnd={onMoveEnd} onHotspotsChanged={setHotspots} />

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

              {hotspots.map((hotspot) => (
                <CircleMarker
                  key={hotspot.locId}
                  center={[hotspot.lat, hotspot.lng]}
                  radius={6}
                  pathOptions={{
                    color: "#d21f19",
                    fillColor: "#f59342",
                    fillOpacity: 0.6,
                    weight: 1,
                  }}
                >
                  <Popup>
                    <strong>{hotspot.locName}</strong>
                  </Popup>
                </CircleMarker>
              ))}

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
                  marginBottom: '10px',
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