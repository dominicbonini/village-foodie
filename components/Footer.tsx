import Link from 'next/link';
import { contactHref } from '@/lib/contact-topics';
import { useT } from '@/lib/i18n/use-t';
import '@/lib/i18n/catalog/siteFooter';

interface FooterProps {
  onOpenTally: () => void;
  // Removed onOpenHireTally from here
  /** False on the page of a truck outside Village Foodie's market (Language Phase 1e tidy): no newsletter and no
   *  Hire / Add my Business / Truck Directory links. Default true — every Village Foodie page is unchanged. */
  discovery?: boolean;
}

// Language Phase 1e: the words are `siteFooter`. They follow the page's provider: the truck page provides its
// truck's country's language (app/trucks/[slug]/TruckClient.tsx); the Village Foodie pages provide none, so they
// read en-GB — Village Foodie is UK-only and its footer is unchanged. The /contact topic in each link is an id
// (`contactHref`), never these words.
export default function Footer({ onOpenTally, discovery = true }: FooterProps) {
  const t = useT('siteFooter');
  return (
    <div className="bg-slate-900 text-slate-300 p-6 text-center mt-auto pb-24">
      {discovery && (
        <>
          <h3 className="text-white font-bold text-lg mb-2">{t('title')}</h3>
          <p className="text-sm mb-4">{t('body')}</p>

          <button
            onClick={onOpenTally}
            className="inline-block bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-6 rounded-full transition-colors"
          >
            {t('cta')}
          </button>
        </>
      )}

      <div className="text-[10px] mt-2 flex flex-col gap-2 items-center">
        {discovery && <p>{t('noSpam')}</p>}
        
        <div className="mt-4 text-center">
           <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-wide">{t('heading')}</h4>
           
           <div className="flex flex-wrap gap-3 md:gap-4 justify-center items-center">
              {discovery && (
                <>
                  <Link
                    href="/hire"
                    className="text-orange-400 font-bold hover:text-orange-300 transition-colors underline decoration-orange-400/50 hover:decoration-orange-300 underline-offset-2"
                  >
                    {t('hire')}
                  </Link>
                  <span className="text-slate-600">|</span>
                </>
              )}
              <Link href={contactHref('general')} className="hover:text-white transition-colors underline decoration-slate-400 hover:decoration-white underline-offset-2">
                {t('general')}
              </Link>
              {discovery && (
                <>
                  <span className="text-slate-600">|</span>
                  <Link href={contactHref('addBusiness')} className="hover:text-white transition-colors underline decoration-slate-400 hover:decoration-white underline-offset-2">
                    {t('addBusiness')}
                  </Link>
                </>
              )}
              <span className="text-slate-600">|</span>
              <Link href={contactHref('reportIssue')} className="hover:text-white transition-colors underline decoration-slate-400 hover:decoration-white underline-offset-2">
                {t('reportIssue')}
              </Link>
              {/* 👇 NEW TRUCK DIRECTORY LINK 👇 */}
              {discovery && (
                <>
                  <span className="text-slate-600">|</span>
                  <Link href="/trucks" className="hover:text-white transition-colors underline decoration-slate-400 hover:decoration-white underline-offset-2">
                    {t('directory')}
                  </Link>
                </>
              )}
           </div>
        </div>
        
        <p className="mt-4 max-w-xs text-center leading-relaxed">
            {t('disclaimer')}
        </p>
      </div>
    </div>
  );
}