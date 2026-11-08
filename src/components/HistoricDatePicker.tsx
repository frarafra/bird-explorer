import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';

type HistoricDatePickerProps = {
    selectedDates: string[];
    onSelectDate: (date: string) => void;
};

const toCalendarDate = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const formatCalendarDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const HistoricDatePicker = ({
    selectedDates,
    onSelectDate,
}: HistoricDatePickerProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isYearGridOpen, setIsYearGridOpen] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(() => new Date());
    const [popupPosition, setPopupPosition] = useState<{
        left: number;
        top: number;
    } | null>(null);
    const datePickerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const popupRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const closePicker = () => {
            setIsOpen(false);
            setIsYearGridOpen(false);
        };
        const handlePointerDown = (event: PointerEvent) => {
            if (
                event.target instanceof Node &&
                !datePickerRef.current?.contains(event.target)
            ) {
                closePicker();
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closePicker();
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setPopupPosition(null);
            return;
        }

        const updatePopupPosition = () => {
            const trigger = triggerRef.current?.getBoundingClientRect();
            const popup = popupRef.current?.getBoundingClientRect();

            if (!trigger || !popup) {
                return;
            }

            const margin = 8;
            const left = Math.max(
                margin,
                Math.min(
                    trigger.left,
                    window.innerWidth - popup.width - margin
                )
            );
            const belowTop = trigger.bottom + margin;
            const top =
                belowTop + popup.height <= window.innerHeight - margin
                    ? belowTop
                    : Math.max(margin, trigger.top - popup.height - margin);

            setPopupPosition({ left, top });
        };

        const animationFrame = window.requestAnimationFrame(updatePopupPosition);
        window.addEventListener('resize', updatePopupPosition);
        window.addEventListener('scroll', updatePopupPosition, true);

        return () => {
            window.cancelAnimationFrame(animationFrame);
            window.removeEventListener('resize', updatePopupPosition);
            window.removeEventListener('scroll', updatePopupPosition, true);
        };
    }, [isOpen, isYearGridOpen, calendarMonth]);

    const calendarDecade = Math.floor(calendarMonth.getFullYear() / 10) * 10;

    return (
        <div
            ref={datePickerRef}
            className="relative flex flex-wrap items-center gap-2"
        >
            <button
                ref={triggerRef}
                type="button"
                onClick={() => {
                    setIsYearGridOpen(false);
                    setPopupPosition(null);
                    setIsOpen((open) => !open);
                }}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                aria-label="Select a date"
                aria-expanded={isOpen}
                aria-haspopup="dialog"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                >
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M8 3v4M16 3v4M3 10h18" />
                </svg>
            </button>
            {isOpen && (
                <div
                    ref={popupRef}
                    className="fixed z-50 max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800"
                    style={{
                        left: popupPosition?.left ?? 0,
                        top: popupPosition?.top ?? 0,
                        visibility: popupPosition ? 'visible' : 'hidden',
                    }}
                    role="dialog"
                    aria-label="Choose historic observation date"
                >
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() =>
                                setCalendarMonth(
                                    (month) =>
                                        new Date(
                                            month.getFullYear() +
                                                (isYearGridOpen ? -10 : 0),
                                            month.getMonth() -
                                                (isYearGridOpen ? 0 : 1),
                                            1
                                        )
                                )
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:bg-slate-700"
                            aria-label={
                                isYearGridOpen ? 'Previous decade' : 'Previous month'
                            }
                        >
                            ‹
                        </button>
                        {isYearGridOpen ? (
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {calendarDecade}–{calendarDecade + 9}
                            </span>
                        ) : (
                            <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {calendarMonth.toLocaleString(undefined, {
                                        month: 'long',
                                    })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsYearGridOpen(true)}
                                    className="rounded px-1 text-sm font-semibold text-sky-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-sky-300 dark:hover:bg-slate-700"
                                    aria-label={`Choose year, currently ${calendarMonth.getFullYear()}`}
                                >
                                    {calendarMonth.getFullYear()}
                                </button>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() =>
                                setCalendarMonth(
                                    (month) =>
                                        new Date(
                                            month.getFullYear() +
                                                (isYearGridOpen ? 10 : 0),
                                            month.getMonth() +
                                                (isYearGridOpen ? 0 : 1),
                                            1
                                        )
                                )
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:bg-slate-700"
                            aria-label={
                                isYearGridOpen ? 'Next decade' : 'Next month'
                            }
                        >
                            ›
                        </button>
                    </div>
                    {isYearGridOpen ? (
                        <div className="grid grid-cols-3 gap-1">
                            {Array.from(
                                { length: 12 },
                                (_, index) => calendarDecade + index - 1
                            ).map((year) => (
                                <button
                                    key={year}
                                    type="button"
                                    onClick={() => {
                                        setCalendarMonth(
                                            (month) =>
                                                new Date(
                                                    year,
                                                    month.getMonth(),
                                                    1
                                                )
                                        );
                                        setIsYearGridOpen(false);
                                    }}
                                    className={`h-9 rounded text-sm hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:bg-sky-900 ${
                                        year === calendarMonth.getFullYear()
                                            ? 'bg-sky-100 font-semibold text-sky-900 dark:bg-sky-900 dark:text-sky-100'
                                            : year < calendarDecade ||
                                                year > calendarDecade + 9
                                              ? 'text-slate-400 dark:text-slate-500'
                                              : 'text-slate-700 dark:text-slate-200'
                                    }`}
                                    aria-pressed={
                                        year === calendarMonth.getFullYear()
                                    }
                                >
                                    {year}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <DayPicker
                            month={calendarMonth}
                            onMonthChange={setCalendarMonth}
                            hideNavigation
                            onDayClick={(date) => {
                                onSelectDate(formatCalendarDate(date));
                                setIsOpen(false);
                            }}
                            modifiers={{
                                historicDate: selectedDates.map(toCalendarDate),
                            }}
                            modifiersClassNames={{
                                historicDate:
                                    'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
                            }}
                            classNames={{
                                root: 'text-sm text-slate-700 dark:text-slate-200',
                                months: 'flex',
                                month: 'space-y-3',
                                month_caption: 'hidden',
                                month_grid: 'w-full border-collapse',
                                weekdays: 'flex',
                                weekday:
                                    'w-9 text-center text-xs font-medium text-slate-500 dark:text-slate-400',
                                week: 'mt-1 flex w-full',
                                day: 'h-9 w-9 p-0 text-center',
                                day_button:
                                    'h-9 w-9 rounded-md border-0 bg-transparent p-0 text-inherit hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:bg-slate-700',
                                today: 'font-bold text-sky-700 dark:text-sky-300',
                                outside: 'text-slate-400 dark:text-slate-500',
                                disabled: 'text-slate-300 dark:text-slate-600',
                                hidden: 'invisible',
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default HistoricDatePicker;
