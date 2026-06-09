"use client";

import React, { useContext } from 'react';
import MainLayout from '../layouts/MainLayout';
import { BirdContext } from '../contexts/BirdContext';
import RecordingList from '../components/RecordingList';

const SongbookPage: React.FC = () => {
    const { birds, mapCenter } = useContext(BirdContext);

    return (
        <MainLayout>
            <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                <RecordingList birds={birds} mapCenter={mapCenter} />
            </div>
        </MainLayout>
    );
};

export default SongbookPage;
