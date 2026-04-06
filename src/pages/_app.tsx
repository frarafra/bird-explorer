import React, { useEffect } from 'react';
import type { AppProps } from 'next/app';
import { BirdProvider } from '../contexts/BirdContext';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
    useEffect(() => {
        const warmUpLambda = async () => {
            try {
                const results = await Promise.allSettled([
                    fetch(`/api/ebirdTaxonFind?bird=ou`),
                    fetch('/api/extractFeatures', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ birds: ['ou'], birdImages: { 'ou': process.env.NEXT_PUBLIC_EBIRD_IMAGE_URL } }),
                    }),
                ]);

                results.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        console.error(`Request ${index + 1} failed:`, result.reason);
                    } else if (!result.value.ok) {
                        console.error(`Request ${index + 1} failed with status:`, result.value.status, result.value.statusText);
                    }
                });
            } catch (error) {
                console.error('Unexpected error during warm-up:', error);
            }
        };

        warmUpLambda();
    }, []);

    return (
        <BirdProvider>
            <Component {...pageProps} />
        </BirdProvider>
    );
}

export default MyApp;