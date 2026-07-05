import { FC, ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';

interface MainLayoutProps {
  children: ReactNode;
  shareButton?: ReactNode;
}

const MainLayout: FC<MainLayoutProps> = ({ children, shareButton }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = savedTheme ? savedTheme === 'dark' : prefersDark;

    setIsDarkMode(shouldUseDark);
    document.documentElement.classList.toggle('dark', shouldUseDark);
    document.documentElement.style.colorScheme = shouldUseDark ? 'dark' : 'light';
  }, []);

  const toggleTheme = () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    document.documentElement.classList.toggle('dark', nextMode);
    document.documentElement.style.colorScheme = nextMode ? 'dark' : 'light';
    window.localStorage.setItem('theme', nextMode ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-[#f8f9fa] dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex items-center justify-between gap-1.5 px-3 py-3 sm:px-6 lg:px-8">
          <nav className="min-w-0 flex-1 sm:w-auto">
            <ul className="flex flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap text-sm font-medium text-slate-700 sm:gap-2 sm:text-base dark:text-slate-200">
              <li><Link href="/" className="rounded px-2 py-1 transition hover:text-slate-900 dark:hover:text-white">Search</Link></li>
              <li><Link href="/birds" className="rounded px-2 py-1 transition hover:text-slate-900 dark:hover:text-white">Birds</Link></li>
              <li><Link href="/songbook" className="rounded px-2 py-1 transition hover:text-slate-900 dark:hover:text-white">Songbook</Link></li>
              <li><Link href="/quizzes" className="rounded px-2 py-1 transition hover:text-slate-900 dark:hover:text-white">Quizzes</Link></li>
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-lg leading-none shadow-sm transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white sm:h-9 sm:w-9 sm:text-xl"
            >
              <span className="inline-flex h-full w-full items-center justify-center leading-none -translate-y-px">
                {isDarkMode ? '◐' : '◑'}
              </span>
            </button>

            {shareButton && (
              <div className="flex-shrink-0 whitespace-nowrap">
                {shareButton}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
};

export default MainLayout;