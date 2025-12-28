import React, { useContext } from 'react';
import BirdList from '../components/BirdList';
import { BirdContext } from '../contexts/BirdContext';
import MainLayout from '../layouts/MainLayout';

const BirdsPage = () => {
    const { birds, taxonomies } = useContext(BirdContext);

    return (
        <MainLayout>
            <div>
                {Object.keys(birds).length > 0 && <BirdList birds={birds} taxonomies={taxonomies} />}
            </div>
        </MainLayout>
    );
};

export default BirdsPage;