import { useCallback, useEffect, useRef, useState } from 'react';

import type { Observation } from '../../types';
import { type RouteGeoJSON } from '../DiversityRouter';

interface UseDiversityRouteArgs {
  observations: Observation[];
  taxonomiesReady: boolean;
  lat: number;
  lng: number;
  mapZoom: number;
  mapDist: number;
}

interface UseDiversityRouteResult {
  diversityRoute: RouteGeoJSON | null;
  routeLoading: boolean;
  routeVisible: boolean;
  disabled: boolean;
  disabledReason?: string;
  handleDiversityRouteToggle: () => Promise<void>;
  dismissRoute: () => void;
}

const useDiversityRoute = ({
  observations,
  taxonomiesReady,
  lat,
  lng,
  mapZoom,
  mapDist,
}: UseDiversityRouteArgs): UseDiversityRouteResult => {
  const [diversityRoute, setDiversityRoute] = useState<RouteGeoJSON | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [lastRouteMapKey, setLastRouteMapKey] = useState<string | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);

  const routeMapKey = `${lat.toFixed(6)}:${lng.toFixed(6)}:${mapZoom}`;
  const routeVisible = mapDist <= 75 && Boolean(diversityRoute);
  const disabled = !taxonomiesReady || mapDist > 75;
  const disabledReason = !taxonomiesReady
    ? 'Waiting for map taxonomies to finish loading'
    : mapDist > 75
      ? 'Route is only available for map areas 75 km or smaller'
      : !observations.length
        ? 'No observations available'
        : undefined;

  const handleDiversityRouteToggle = useCallback(async () => {
    if (routeLoading) {
      return;
    }

    if (!taxonomiesReady) {
      if (retryTimeoutRef.current === null) {
        retryTimeoutRef.current = window.setTimeout(() => {
          retryTimeoutRef.current = null;
          void handleDiversityRouteToggle();
        }, 1000);
      }
      return;
    }

    if (!observations.length) {
      console.warn('No observations available for diversity route');
      return;
    }

    if (diversityRoute && lastRouteMapKey !== routeMapKey) {
      setDiversityRoute(null);
    }

    if (diversityRoute && lastRouteMapKey === routeMapKey) {
      setDiversityRoute(null);
      return;
    }

    setRouteLoading(true);

    try {
      const response = await fetch('/api/generateRoute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ observations }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error || `Route generation failed: ${response.status}`
        );
      }

      const geojson: RouteGeoJSON = await response.json();
      setDiversityRoute(geojson);
      setLastRouteMapKey(routeMapKey);
    } catch (error) {
      console.error('Error generating diversity route:', error);
    } finally {
      setRouteLoading(false);
    }
  }, [routeLoading, taxonomiesReady, observations, diversityRoute, lastRouteMapKey, routeMapKey]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    diversityRoute,
    routeLoading,
    routeVisible,
    disabled,
    disabledReason,
    handleDiversityRouteToggle,
    dismissRoute: () => setDiversityRoute(null),
  };
};

export default useDiversityRoute;
