import React, { useEffect } from 'react';
import type { AppProps } from 'next/app';
import { BirdProvider } from '../contexts/BirdContext';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
    useEffect(() => {
        const warmUpLambda = async () => {
            try {
                const results = await fetch(`/api/ebirdTaxonFind?bird=ou`);

                if (!results.ok) {
                    console.error(`Request failed with status:`, results.status, results.statusText);
                }
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