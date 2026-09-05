import React, { useState } from 'react';

export interface RouteGeoJSON {
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

interface DiversityRouterProps {
  routeVisible: boolean;
  loading: boolean;
  disabled: boolean;
  onToggleRoute: () => void;
  disabledReason?: string;
}

const DiversityRouter = ({
  routeVisible,
  loading,
  disabled,
  onToggleRoute,
  disabledReason,
}: DiversityRouterProps) => {

  const buttonClasses = [
    'absolute right-[10px] top-[110px] z-[9999]',
    'flex h-11 w-11 items-center justify-center rounded-full border',
    'border-slate-200 bg-white text-slate-900 shadow-sm transition-colors',
    'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
    disabled ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400' : 'cursor-pointer',
  ].join(' ');

  return (
    <button
      type="button"
      onClick={onToggleRoute}
      disabled={disabled}
      title={
        loading
          ? 'Finding the most diverse route...'
          : routeVisible
            ? 'Hide the current diversity route'
            : disabledReason || 'Show 5 locations with maximum combined species diversity'
      }
      aria-label={
        routeVisible
          ? 'Hide the current diversity route'
          : 'Show 5 locations with maximum combined species diversity'
      }
      className={buttonClasses}
    >
      {loading ? (
        <span className="text-sm font-medium">...</span>
      ) : (
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M2.5 5.5L8 3L15 6.5L21.5 3.5V18.5L15 21L8 17.5L2.5 20.5V5.5Z"
            stroke={disabled ? '#94a3b8' : '#2563eb'}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 8L9.5 12L14.5 9L18.5 14.5"
            stroke={disabled ? '#94a3b8' : '#2563eb'}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="5.5" cy="8" r="1.5" fill={disabled ? '#94a3b8' : '#2563eb'} />
          <circle cx="9.5" cy="12" r="1.5" fill={disabled ? '#94a3b8' : '#2563eb'} />
          <circle cx="14.5" cy="9" r="1.5" fill={disabled ? '#94a3b8' : '#2563eb'} />
          <circle cx="18.5" cy="14.5" r="1.5" fill={disabled ? '#94a3b8' : '#2563eb'} />
        </svg>
      )}
    </button>
  );
};

export default DiversityRouter;
