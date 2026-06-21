import React, { FC } from 'react';
import Link from 'next/link';
import styles from './MainLayout.module.css';

interface MainLayoutProps {
  children: React.ReactNode;
  shareButton?: React.ReactNode;
}

const MainLayout: FC<MainLayoutProps> = ({ children, shareButton }) => (
  <div className={styles.container}>
    <header className={styles.header}>
      <nav className={styles.nav}>
        <ul className={styles.menu}>
          <li><Link href="/">Search</Link></li>
          <li><Link href="/birds">Birds</Link></li>
          <li><Link href="/songbook">Songbook</Link></li>
          <li><Link href="/quizzes">Quizzes</Link></li>
        </ul>
      </nav>

      {shareButton && (
        <div className={styles.shareButton}>
          {shareButton}
        </div>
      )}
    </header>

    <main className={styles.main}>
      {children}
    </main>
  </div>
);

export default MainLayout;