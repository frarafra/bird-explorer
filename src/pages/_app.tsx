import React, { useEffect } from 'react';
import type { AppProps } from 'next/app';
import { BirdProvider } from '../contexts/BirdContext';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
    useEffect(() => {
        const warmUpLambda = async () => {
            try {
                const response = await fetch(`/api/ebirdTaxonFind?bird=ou`);
                if (!response.ok) {
                    console.error('Failed to warm up Lambda function:', response.status, response.statusText);
                }
            } catch (error) {
                console.error('Error warming up Lambda function:', error);
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