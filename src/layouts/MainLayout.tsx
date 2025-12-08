import React, { FC } from 'react';
import Link from 'next/link';

interface MainLayoutProps {
    children: React.ReactNode;
    shareButton?: React.ReactNode;
}

const MainLayout: FC<MainLayoutProps> = ({ children, shareButton }) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #e9ecef' }}>
            <nav style={{ flex: 1, textAlign: 'left' }}>
                <ul style={{ listStyleType: 'none', display: 'flex', gap: '2rem' }}>
                    <li><Link href="/">Search</Link></li>
                    <li><Link href="/birds">Bird List</Link></li>
                </ul>
            </nav>
            {shareButton && <div className="share-button">{shareButton}</div>}
        </header>

        <main style={{ padding: '1rem' }}>
            {children}
        </main>
    </div>
);

export default MainLayout;