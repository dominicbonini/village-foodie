import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hire a Food Truck | Village Foodie",
  description: "Book the best local food trucks for your pub pop-up or private event in rural Suffolk.",
};

export default function HirePage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* Simple Header to let them navigate back */}
      <header className="bg-slate-900 text-white py-4 px-4 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold flex items-center gap-2 hover:text-orange-400 transition-colors">
            Village Foodie 🚚
          </Link>
          <Link href="/" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
            ← Back to Map
          </Link>
        </div>
      </header>

      {/* The Form Container */}
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-8 md:py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-slate-900 mb-3">Hire a Local Food Truck</h1>
          <p className="text-slate-600 max-w-xl mx-auto">
            Looking for a pop-up for your pub, or catering for a private party? Tell us what you need, and we'll introduce you to the best street food vendors in the area—completely free.
          </p>
        </div>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Your Tally Form Iframe */}
          <iframe 
            src="https://tally.so/embed/Y5dWKW?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1" 
            width="100%" 
            height="500" 
            frameBorder="0" 
            marginHeight={0} 
            marginWidth={0} 
            title="Hire a Food Truck Form">
          </iframe>
        </div>
      </div>
    </main>
  );
}