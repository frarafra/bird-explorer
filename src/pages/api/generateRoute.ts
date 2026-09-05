import type { NextApiRequest, NextApiResponse } from 'next';

import type { Observation } from '../../types';

interface SelectedLocation {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  speciesCodes: Set<string>;
  speciesCount: number;
}

interface RouteGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      type: 'route' | 'location';
      index?: number;
      locId?: string;
      locName?: string;
      speciesCount?: number;
      combinedSpeciesCount?: number;
    };
    geometry:
      | {
          type: 'Point';
          coordinates: [number, number];
        }
      | {
          type: 'LineString';
          coordinates: [number, number][];
        };
  }>;
}

const buildLocations = (
  observationList: Observation[]
): SelectedLocation[] => {
  const locations = new globalThis.Map<string, SelectedLocation>();

  observationList.forEach((observation: Observation) => {
    const { locId, locName, lat, lng, speciesCode } = observation;

    if (
      !locId ||
      !locName ||
      !speciesCode ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return;
    }

    let location = locations.get(locId);

    if (!location) {
      location = {
        locId,
        locName,
        lat: lat as number,
        lng: lng as number,
        speciesCodes: new Set<string>(),
        speciesCount: 0,
      };

      locations.set(locId, location);
    }

    location.speciesCodes.add(speciesCode);
    location.speciesCount = location.speciesCodes.size;
  });

  return Array.from(locations.values());
};

const selectMostDiverseLocations = (
  locations: SelectedLocation[]
): {
  locations: SelectedLocation[];
  combinedSpecies: Set<string>;
} => {
  const selected: SelectedLocation[] = [];
  const combinedSpecies = new Set<string>();
  const remaining = [...locations];

  while (selected.length < 5 && remaining.length > 0) {
    let bestIndex = -1;
    let bestNewSpecies = -1;
    let bestTotalSpecies = -1;

    remaining.forEach((location, index) => {
      let newSpecies = 0;

      location.speciesCodes.forEach((speciesCode) => {
        if (!combinedSpecies.has(speciesCode)) {
          newSpecies++;
        }
      });

      if (
        newSpecies > bestNewSpecies ||
        (newSpecies === bestNewSpecies &&
          location.speciesCount > bestTotalSpecies)
      ) {
        bestIndex = index;
        bestNewSpecies = newSpecies;
        bestTotalSpecies = location.speciesCount;
      }
    });

    if (bestIndex === -1) {
      break;
    }

    const [selectedLocation] = remaining.splice(bestIndex, 1);
    selected.push(selectedLocation);

    selectedLocation.speciesCodes.forEach((speciesCode) => {
      combinedSpecies.add(speciesCode);
    });
  }

  return {
    locations: selected,
    combinedSpecies,
  };
};

export const generateDiversityRoute = async (
  observations: Observation[]
): Promise<RouteGeoJSON> => {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new Error('No observations available for diversity route');
  }

  const locations = buildLocations(observations);

  if (locations.length < 2) {
    throw new Error('Not enough unique locations to create a route');
  }

  const { locations: selectedLocations, combinedSpecies } =
    selectMostDiverseLocations(locations);

  if (selectedLocations.length < 2) {
    throw new Error('Could not find enough locations for a route');
  }

  const coordinateString = selectedLocations
    .map(({ lng, lat }) => `${lng},${lat}`)
    .join(';');

  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordinateString}?overview=full&geometries=geojson`
  );

  if (!response.ok) {
    throw new Error(`OSRM request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`No route found: ${data.code}`);
  }

  const route = data.routes[0];

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          type: 'route',
        },
        geometry: route.geometry,
      },
      ...selectedLocations.map((location, index) => ({
        type: 'Feature' as const,
        properties: {
          type: 'location' as const,
          index: index + 1,
          locId: location.locId,
          locName: location.locName,
          speciesCount: location.speciesCount,
          combinedSpeciesCount: combinedSpecies.size,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [location.lng, location.lat] as [number, number],
        },
      })),
    ],
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { observations } = req.body ?? {};

    if (!Array.isArray(observations)) {
      return res.status(400).json({ error: 'Observations array is required' });
    }

    const geojson = await generateDiversityRoute(observations);
    return res.status(200).json(geojson);
  } catch (error) {
    console.error('Error generating diversity route:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal Server Error',
    });
  }
}
