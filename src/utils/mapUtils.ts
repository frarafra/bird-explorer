import { Result } from "../types";

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function findClosestResult(results: Result[], targetLat: number, targetLng: number): Result {
  let closest = results[0];
  let minDistance = haversineDistance(targetLat, targetLng, closest.lat, closest.lng);

  for (const result of results) {
    const distance = haversineDistance(targetLat, targetLng, result.lat, result.lng);
    if (distance < minDistance) {
      minDistance = distance;
      closest = result;
    }
  }

  return closest;
}

export  const calculateObservationsBoundariesCenter = (results: Result[]) => {
    const latitudes = results.map(result => result.lat);
    const longitudes = results.map(result => result.lng);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const lat = (minLat + maxLat) / 2;
    const lng = (minLng + maxLng) / 2;

    return { lat, lng };
};