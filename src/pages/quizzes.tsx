"use client";

import React from 'react';
import MainLayout from '../layouts/MainLayout';
import QuizGenerator from '../components/QuizGenerator';

const QuizzesPage: React.FC = () => {
    return (
        <MainLayout>
            <QuizGenerator />
        </MainLayout>
    );
};

export default QuizzesPage;