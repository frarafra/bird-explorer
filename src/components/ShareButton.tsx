'use client';

import React, { useRef, useEffect } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';

import { MapCenter } from '../types';

interface ShareButtonProps {
    mapCenter: MapCenter;
    mapZoom: number;
    species?: string;
}

const ShareButton = ({ mapCenter, mapZoom, species }: ShareButtonProps) => {
    const isInitialMount = useRef(true);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
    }, []);

    const getShareableLink = () => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams({
                lat: mapCenter.lat.toString(),
                lng: mapCenter.lng.toString(),
                zoom: mapZoom.toString(),
            });

            if (species) {
                params.set('species', species);
            }

            return `${window.location.origin}?${params.toString()}`;
        }

        return '';
    };

    return (
        <CopyToClipboard
            text={getShareableLink()}
            onCopy={() => alert('Link copied to clipboard!')}
        >
            <button
                type="button"
                aria-label="Copy shareable link"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white sm:px-3 sm:py-2 sm:text-sm"
            >
                Link
            </button>
        </CopyToClipboard>
    );
};

export default ShareButton;
