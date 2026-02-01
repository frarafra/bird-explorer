import React from 'react';
import type { AppProps } from 'next/app';
import { BirdProvider } from '../contexts/BirdContext';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <BirdProvider>
            <Component {...pageProps} />
        </BirdProvider>
    );
}

export default MyApp;