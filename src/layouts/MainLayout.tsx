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
    <div className="flex min-h-screen flex-col overflow-hidden bg-white text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-[#f8f9fa] dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex items-center justify-between gap-1.5 px-3 py-3 sm:px-6 lg:px-8">
          <nav className="min-w-0 flex-1 overflow-hidden sm:w-auto">
            <ul className="flex min-w-max items-center gap-1 whitespace-nowrap text-sm font-medium text-slate-700 sm:gap-2 sm:text-base dark:text-slate-200">
              <li className="shrink-0"><Link href="/" className="rounded px-2 py-1 transition hover:text-slate-900 dark:hover:text-white">Search</Link></li>
              <li className="shrink-0"><Link href="/birds" className="rounded px-2 py-1 transition hover:text-slate-900 dark:hover:text-white">Birds</Link></li>
              <li className="shrink-0"><Link href="/songbook" className="rounded px-2 py-1 transition hover:text-slate-900 dark:hover:text-white">Songbook</Link></li>
              <li className="shrink-0"><Link href="/quizzes" className="rounded px-2 py-1 transition hover:text-slate-900 dark:hover:text-white">Quizzes</Link></li>
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-lg leading-none text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white sm:h-8 sm:w-8 sm:text-xl"
            >
              <span className="inline-flex h-full w-full items-center justify-center leading-none">
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

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
};

export default MainLayout;