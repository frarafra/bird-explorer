"use client";

import React, { useContext, useState } from 'react';
import { BirdContext } from '../contexts/BirdContext';

const QuizGenerator: React.FC = () => {
    const { mapCenter } = useContext(BirdContext);
    const [loading, setLoading] = useState(false);
    const [quiz, setQuiz] = useState('');

    async function generateQuiz() {
        setLoading(true);
        setQuiz('');

        try {
            const res = await fetch('/api/quizGenerator', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat: mapCenter.lat, lng: mapCenter.lng, dist: 25 }),
            });

            const data = await res.json();
            setQuiz(data.quiz || data.error || 'No quiz generated.');
        } catch (error) {
            setQuiz('Unable to generate a quiz right now.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <h3>🐦 Bird Observations Quizzes</h3>
            <p style={{ color: '#6c757d', marginBottom: 12 }}>
                Generate quizzes based on birds near your current map location.
            </p>

            <button onClick={generateQuiz} disabled={loading} style={{ marginTop: 10 }}>
                {loading ? 'Generating...' : 'Generate Quiz'}
            </button>

            <pre style={{ marginTop: 20, whiteSpace: 'pre-wrap' }}>
                {quiz}
            </pre>
        </div>
    );
};

export default QuizGenerator;
