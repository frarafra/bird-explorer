import React, { useState, useEffect, useRef, useContext } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';

import ComparisonResults from './ComparisonResults';
import { MapEventsHandlerProps, Result } from '../types';
import { calculateBounds } from '../utils/mapUtils';
import { BirdContext } from '../contexts/BirdContext';
import useMapState from './hooks/useMapState';
import useHotspots from './hooks/useHotspots';
import { Hotspot } from '../types';

interface MapProps {
    extended: boolean;
    lat: number;
    lng: number;
    results: Result[];
    hoveredResultId: number | null;
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

const MapEventsHandler = ({
  onMoveEnd,
  onHotspotsChanged,
  setMapDist,
  setMapZoom,
}: MapEventsHandlerProps) => {
  const map = useMap();

  const timeoutRef = useRef<NodeJS.Timeout>(null);

  const getMapState = useMapState(
    map,
    onMoveEnd,
    setMapDist,
    setMapZoom
  );

  const fetchHotspots = useHotspots(onHotspotsChanged);

  useEffect(() => {
    const update = () => {
      const { center, zoom, dist } = getMapState();
      fetchHotspots(center, zoom, dist);
    };

    const handleMoveEnd = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(update, 500);
    };

    update();

    map.on("moveend", handleMoveEnd);

    return () => {
      map.off("moveend", handleMoveEnd);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [map, getMapState, fetchHotspots]);

  return null;
};

const UpdateMapView = ({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom);
  }, [lat, lng, zoom, map]);
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
  
const Map: React.FC<MapProps> = ({ extended, lat, lng, results, hoveredResultId }) => {
  const { setMapCenter, setMapDist, mapZoom, setMapZoom, setObservations } = useContext(BirdContext);
  const [compareMode, setCompareMode] = useState(false);
  const [point1, setPoint1] = useState<{lat: number, lng: number, species: string[]} | null>(null);
  const [point2, setPoint2] = useState<{lat: number, lng: number, species: string[]} | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
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

  const mapButtonClass = 'absolute right-[10px] z-[9999] w-[44px] h-[44px] p-0 rounded-full flex items-center justify-center border shadow-sm cursor-pointer';

  return (
      <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
            <MapContainer
              {...(!extended ? { center: [lat, lng], zoom: mapZoom } : {})}
              zoomControl={false}
              style={{ height: "100%", width: "100%" }}
            >
              <ZoomControl position="bottomright" />
              <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {extended && <FitBounds bounds={bounds} />}
              <UpdateMapView lat={lat} lng={lng} zoom={mapZoom} />

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

              <MapEventsHandler onMoveEnd={setMapCenter} onHotspotsChanged={setHotspots} setMapDist={setMapDist} setMapZoom={setMapZoom} />

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
                      <strong>
                        <a href={`https://ebird.org/hotspot/${hotspot.locId}`} target="_blank" rel="noopener noreferrer">
                          {hotspot.locName}
                        </a>
                      </strong>
                    </Popup>
                </CircleMarker>
              ))}

              {compareMode && <MapClickHandler onLocationSelected={handleLocationSelected} />}

          <button
              onClick={() => {
                setCompareMode(!compareMode);
                if (!compareMode) {
                  setPoint1(null);
                  setPoint2(null);
                }
              }}
              title={compareMode ? 'Cancel compare' : 'Compare locations'}
              aria-pressed={compareMode}
              className={`${mapButtonClass} top-[60px] ${ compareMode ? 'bg-red-500 text-white border-red-600' : 'bg-white text-slate-900 border-slate-200' }`} 
          >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2C8.686 2 6 4.686 6 8c0 4.42 6 12 6 12s6-7.58 6-12c0-3.314-2.686-6-6-6z" fill={compareMode ? '#fff' : '#10b981'} />
                <circle cx="12" cy="8" r="2" fill={compareMode ? '#fff' : '#065f46'} />
                <path d="M7 11a5 5 0 1 0-2 3.9" stroke={compareMode ? 'rgba(255,255,255,0.8)' : '#10b981'} strokeWidth="0" />
              </svg>
          </button>

          <div>
            <button
              onClick={() => setShowLocationSearch((s) => !s)}
              aria-label="Open location search"
              className={`${mapButtonClass} top-[10px] bg-white text-slate-900 border-slate-200`} 
            >
              <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" aria-hidden>
                <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z" />
              </svg>
            </button>

            {showLocationSearch && (
              <div className={`${isMobile ? 'left-1/2 -translate-x-1/2 w-[90%]' : 'right-[10px] w-[300px]'} absolute top-[110px] z-[9999] bg-white p-2 rounded-md shadow-lg`}>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const searchValue = locationQuery.trim();
                    if (!searchValue) return;
                    try {
                      const timestamp = new Date().getTime();
                      const response = await fetch(`/api/osNominatim?location=${encodeURIComponent(searchValue)}&_=${timestamp}`);
                      if (!response.ok) {
                        console.warn(`Location not found for: ${searchValue}`);
                        return;
                      }
                      const { lat, lon } = await response.json();
                      const parsedLat = Number(lat);
                      const parsedLng = Number(lon);
                      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
                        return;
                      }
                      setMapCenter({ lat: parsedLat, lng: parsedLng });
                      setMapDist(25);
                      setMapZoom(12);
                      if (setObservations) setObservations([]);
                      setShowLocationSearch(false);
                      setLocationQuery('');
                    } catch (err) {
                      console.error('Error searching location from map:', err);
                    }
                  }}
                >
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        value={locationQuery}
                        onChange={(e) => setLocationQuery(e.target.value)}
                        placeholder="Go to place"
                        aria-label="Location"
                        className="w-full px-3 py-2 rounded-md border border-slate-200 focus:outline-none"
                      />
                    </div>
                    <button type="submit" disabled={!locationQuery.trim()} className="px-3 py-2 rounded-md bg-emerald-500 text-white">
                      Go
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          </MapContainer>

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