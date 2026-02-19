import Link from 'next/link';

interface FooterProps {
  onOpenTally: () => void;
}

export default function Footer({ onOpenTally }: FooterProps) {
  return (
    <div className="bg-slate-900 text-slate-300 p-6 text-center mt-auto pb-24">
      <h3 className="text-white font-bold text-lg mb-2">Never miss a slice 🍕</h3>
      <p className="text-sm mb-4">Get the village food schedule sent to your inbox every week.</p>
      
      <button 
        onClick={onOpenTally}
        className="inline-block bg-orange-600 hover:bg-orange-500 text-white font-bold py-2 px-6 rounded-full transition-colors"
      >
        Get the Schedule
      </button>

      {/* Changed mt-4 to mt-2 for a much tighter gap */}
      <div className="text-[10px] mt-2 flex flex-col gap-2 items-center">
        <p>No Spam (but maybe Pepperoni). Unsubscribe Anytime.</p>
        
        <div className="mt-2 text-center">
           <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-wide">Contact Us</h4>
           <div className="flex gap-4 justify-center">
              <Link href="/contact?topic=General%20Enquiry" className="hover:text-white transition-colors underline decoration-slate-400 hover:decoration-white underline-offset-2">
                General Enquiry
              </Link>
              <span>|</span>
              <Link href="/contact?topic=Add%20Business" className="hover:text-white transition-colors underline decoration-slate-400 hover:decoration-white underline-offset-2">
                Add my Business
              </Link>
              <span>|</span>
              <Link href="/contact?topic=Report%20Issue" className="hover:text-white transition-colors underline decoration-slate-400 hover:decoration-white underline-offset-2">
                Report Issue
              </Link>
           </div>
        </div>
        
        <p className="mt-4 max-w-xs text-center leading-relaxed">
            Disclaimer: Schedules are subject to change by vendors. We do our best, but we are not responsible for cancelled trucks or sold-out burgers. Always check the vendor's social media for last-minute updates.
        </p>
      </div>
    </div>
  );
}