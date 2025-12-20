import React from 'react';

interface BirdsLocationProps {
    lat: number;
    lng: number;
    species: string[];
}

interface ComparisonResultsProps {
    point1: BirdsLocationProps;
    point2: BirdsLocationProps;
    onClose: () => void;
}

const ComparisonResults: React.FC<ComparisonResultsProps> = ({ point1, point2, onClose }) => {
    if (!point1 || !point2) return null;

    const birds1 = [...new Set(point1.species)];
    const birds2 = [...new Set(point2.species)];

    const commonBirds = birds1.filter(bird => birds2.includes(bird));

    const uniqueToPoint1 = birds1.filter(bird => !birds2.includes(bird));
    const uniqueToPoint2 = birds2.filter(bird => !birds1.includes(bird));

    return (
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 0 10px rgba(0,0,0,0.3)',
            zIndex: 1000,
            maxWidth: '80%',
            maxHeight: '80%',
            overflow: 'auto'
        }}>
            <h3>Comparison Results</h3>
            <button onClick={onClose} style={{ float: 'right' }}>Close</button>

            <div style={{ marginTop: '20px' }}>
                <h4>Unique to Point 1 ({point1.lat}, {point1.lng}): ({uniqueToPoint1.length})</h4>
                <ul>
                    {uniqueToPoint1.map(specie => (
                        <li key={specie}>{specie}</li>
                    ))}
                </ul>
            </div>

            <div style={{ marginTop: '20px' }}>
                <h4>Unique to Point 2 ({point2.lat}, {point2.lng}): ({uniqueToPoint2.length})</h4>
                <ul>
                    {uniqueToPoint2.map(specie => (
                        <li key={specie}>{specie}</li>
                    ))}
                </ul>
            </div>

            <div style={{ marginTop: '20px' }}>
                <h4>Common Birds ({commonBirds.length})</h4>
                <ul>
                    {commonBirds.map(specie => (
                        <li key={specie}>{specie}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default ComparisonResults;