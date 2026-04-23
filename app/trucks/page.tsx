'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useVillageData } from '@/hooks/useVillageData';

export default function TruckDirectory() {
  const { allTrucks, loading } = useVillageData(null, { date: 'all', cuisine: 'all', distance: '500' });

  // 1. Sort trucks alphabetically
  const sortedTrucks = useMemo(() => {
    if (!allTrucks || allTrucks.length === 0) return [];
    return [...allTrucks].sort((a, b) => a.rawName.localeCompare(b.rawName));
  }, [allTrucks]);

  // 2. Create a Set of active letters for quick lookup
  const activeLetters = useMemo(() => {
    const letters = new Set<string>();
    sortedTrucks.forEach(truck => {
      const firstChar = truck.rawName.charAt(0).toUpperCase();
      letters.add(/[A-Z]/.test(firstChar) ? firstChar : '#');
    });
    return letters;
  }, [sortedTrucks]);

  // 3. Full alphabet array for the UI
  const alphabet = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* 👇 GLOBAL NAVIGATION HEADER 👇 */}
      <header className="bg-[#111827] px-4 py-3 flex items-center shadow-md sticky top-0 z-50">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-90">
          <Image
            src="/logos/village-foodie-logo-v2.png"
            alt="Village Foodie"
            width={160}
            height={48}
            className="object-contain"
            priority
          />
        </Link>
      </header>

      <main className="flex flex-col items-center py-10 px-4 flex-1">
        <div className="max-w-2xl w-full">
          
          <div className="text-center mb-6">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Truck Directory</h1>
            <p className="text-slate-600 mt-2 font-medium">Browse active food trucks and pop-ups in the Village Foodie network.</p>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 animate-pulse font-medium">
              Loading directory...
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 relative">
              
              {/* 👇 UPDATED: Adjusted top padding to top-[72px] so it clears the new sticky header 👇 */}
              <div className="bg-white/95 backdrop-blur-md border-b border-slate-200 py-3 px-2 sm:px-4 sticky top-[72px] z-40 flex flex-wrap justify-center gap-0.5 shadow-sm rounded-t-2xl">
                {alphabet.map(letter => {
                  const isActive = activeLetters.has(letter);
                  return isActive ? (
                    <a 
                      key={letter} 
                      href={`#letter-${letter}`}
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-slate-700 hover:text-orange-600 hover:bg-orange-50 font-bold text-sm sm:text-base rounded-full transition-colors"
                      aria-label={`Jump to trucks starting with ${letter}`}
                    >
                      {letter}
                    </a>
                  ) : (
                    <span 
                      key={letter} 
                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center text-slate-200 font-medium text-sm sm:text-base cursor-default select-none"
                      aria-hidden="true"
                    >
                      {letter}
                    </span>
                  );
                })}
              </div>

              {/* CONTINUOUS DIRECTORY LIST */}
              {sortedTrucks.length > 0 ? (
                <ul className="flex flex-col p-4 md:p-6">
                  {sortedTrucks.map((truck, index) => {
                    const firstChar = truck.rawName.charAt(0).toUpperCase();
                    const letterKey = /[A-Z]/.test(firstChar) ? firstChar : '#';
                    
                    let isFirstOfLetter = false;
                    if (index === 0) {
                      isFirstOfLetter = true;
                    } else {
                      const prevChar = sortedTrucks[index - 1].rawName.charAt(0).toUpperCase();
                      const prevLetterKey = /[A-Z]/.test(prevChar) ? prevChar : '#';
                      isFirstOfLetter = letterKey !== prevLetterKey;
                    }

                    return (
                      <li 
                        key={truck.cleanKey} 
                        // 👇 UPDATED: Increased scroll margin to account for BOTH headers 👇
                        id={isFirstOfLetter ? `letter-${letterKey}` : undefined}
                        className={isFirstOfLetter ? 'scroll-mt-[200px]' : ''}
                      >
                        <Link 
                          href={`/trucks/${truck.cleanKey}`}
                          className="flex items-center gap-4 p-2 rounded-xl hover:bg-orange-50 transition-colors group"
                        >
                          <div className="w-12 h-12 relative rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center shadow-sm">
                            {truck.logoUrl ? (
                              <Image
                                src={truck.logoUrl}
                                alt={`${truck.rawName} logo`}
                                fill
                                className="object-cover"
                                sizes="48px"
                              />
                            ) : (
                              <span className="text-xl">🚚</span>
                            )}
                          </div>
                          
                          <div className="text-lg text-slate-800 font-semibold group-hover:text-orange-600 transition-colors">
                            {truck.rawName}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="text-center text-slate-500 py-8">
                  No trucks found.
                </div>
              )}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors underline underline-offset-4">
              ← Back to Map
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}