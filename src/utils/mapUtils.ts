import { Result } from '../types';

export const calculateBounds = (results: Result[]): [[number, number], [number, number]] | null => {
  if (results.length === 0) return null;
  
  const lats = results.map(r => r.lat);
  const lngs = results.map(r => r.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  
  return [[minLat, minLng], [maxLat, maxLng]];
};
