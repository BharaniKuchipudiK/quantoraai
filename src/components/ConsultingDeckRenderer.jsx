import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, BarChart3, Presentation } from 'lucide-react';

export default function ConsultingDeckRenderer({ deck, isLight = true }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!deck || !deck.slides || deck.slides.length === 0) {
    return <div className="flex h-full items-center justify-center text-red-500">Invalid Deck Data</div>;
  }

  const slides = deck.slides;
  const slide = slides[currentSlide];

  const goNext = () => setCurrentSlide(c => Math.min(c + 1, slides.length - 1));
  const goPrev = () => setCurrentSlide(c => Math.max(c - 1, 0));

  // Corporate theme colors based on mode
  const bg = isLight ? "bg-slate-50" : "bg-slate-900";
  const textMain = isLight ? "text-slate-900" : "text-slate-50";
  const textMuted = isLight ? "text-slate-500" : "text-slate-400";
  const border = isLight ? "border-slate-200" : "border-slate-700";
  const accent = "text-blue-600";
  const accentBg = "bg-blue-600";

  const renderSlideContent = (slide) => {
    switch (slide.type) {
      case 'cover':
        return (
          <div className={`flex flex-col h-full items-center justify-center text-center p-12 ${bg} border-t-8 border-blue-600`}>
            <div className="mb-4">
              <Presentation size={48} className={accent} />
            </div>
            <h1 className={`text-5xl font-bold tracking-tight mb-6 ${textMain}`}>{slide.title}</h1>
            {slide.subtitle && <h2 className={`text-2xl font-medium ${textMuted}`}>{slide.subtitle}</h2>}
            <div className={`mt-auto text-sm font-semibold uppercase tracking-widest ${accent}`}>
              {deck.title}
            </div>
          </div>
        );
      case 'section':
        return (
          <div className={`flex flex-col h-full justify-center p-16 ${accentBg} text-white`}>
            <h2 className="text-xl font-bold uppercase tracking-widest text-blue-200 mb-4">Section</h2>
            <h1 className="text-5xl font-bold leading-tight">{slide.title}</h1>
            {slide.subtitle && <p className="text-2xl text-blue-100 mt-6">{slide.subtitle}</p>}
          </div>
        );
      case 'data_viz':
        return (
          <div className={`flex flex-col h-full p-12 ${bg}`}>
            <h1 className={`text-3xl font-bold mb-2 ${textMain}`}>{slide.title}</h1>
            {slide.subtitle && <h2 className={`text-lg mb-8 ${textMuted}`}>{slide.subtitle}</h2>}
            <div className="flex-1 flex gap-8">
              <div className="flex-1 flex flex-col justify-center">
                <ul className="space-y-4">
                  {(slide.bullets || []).map((b, i) => (
                    <li key={i} className={`flex items-start text-lg ${textMain}`}>
                      <span className={`mr-3 mt-1 ${accent}`}>▸</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`flex-1 flex flex-col items-center justify-center p-8 rounded-xl bg-slate-100 dark:bg-slate-800 ${border} border`}>
                <BarChart3 size={64} className={`${accent} mb-6`} />
                <div className="w-full flex h-48 items-end justify-around gap-2 mt-4 border-b border-slate-300 dark:border-slate-600 pb-2">
                  {/* Mock data viz if not provided, else render data bars */}
                  {(slide.data && slide.data.length > 0 ? slide.data : [{label:'Q1', value: 30}, {label:'Q2', value: 50}, {label:'Q3', value: 80}, {label:'Q4', value: 65}]).map((d, i) => {
                    const maxVal = Math.max(...(slide.data || []).map(x => x.value), 100);
                    const height = `${(d.value / maxVal) * 100}%`;
                    return (
                      <div key={i} className="flex flex-col items-center w-full">
                        <span className={`text-xs mb-2 font-bold ${textMain}`}>{d.value}</span>
                        <div className={`w-full ${accentBg} rounded-t-sm transition-all duration-500`} style={{height}}></div>
                        <span className={`text-xs mt-2 ${textMuted}`}>{d.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      case 'quote':
        return (
          <div className={`flex flex-col h-full justify-center items-center p-16 ${bg} text-center`}>
            <div className={`text-6xl ${accent} mb-6`}>"</div>
            <h1 className={`text-3xl font-medium italic leading-relaxed mb-8 ${textMain}`}>
              {slide.quote || slide.title}
            </h1>
            {slide.author && <p className={`text-xl font-bold uppercase tracking-widest ${accent}`}>— {slide.author}</p>}
          </div>
        );
      case 'matrix':
      case 'bullets':
      default:
        return (
          <div className={`flex flex-col h-full p-12 ${bg}`}>
            <h1 className={`text-3xl font-bold mb-2 ${textMain}`}>{slide.title}</h1>
            {slide.subtitle && <h2 className={`text-lg mb-8 ${textMuted}`}>{slide.subtitle}</h2>}
            <div className={`flex-1 grid gap-6 ${slide.type === 'matrix' ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1'}`}>
              {(slide.bullets || []).map((b, i) => (
                <div key={i} className={`flex items-start text-lg ${textMain} ${slide.type === 'matrix' ? 'p-6 rounded-lg bg-slate-100 dark:bg-slate-800 border '+border : ''}`}>
                  <span className={`mr-4 mt-1 ${accent}`}>■</span>
                  <span className={slide.type === 'matrix' ? 'font-medium' : ''}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        );
    }
  };

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center bg-slate-200 dark:bg-slate-950 p-4`}>
      {/* 16:9 Aspect Ratio Container */}
      <div 
        className="relative w-full max-w-[1024px] shadow-2xl rounded-xl overflow-hidden transition-colors duration-300"
        style={{ aspectRatio: '16/9' }}
      >
        {renderSlideContent(slide)}

        {/* Footer / Page Number */}
        {slide.type !== 'cover' && slide.type !== 'section' && (
          <div className={`absolute bottom-6 left-12 right-12 flex justify-between items-center text-xs font-bold uppercase tracking-widest ${textMuted}`}>
            <span>{deck.title}</span>
            <span>{currentSlide + 1} / {slides.length}</span>
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      <div className="mt-8 flex items-center gap-6">
        <button 
          onClick={goPrev} 
          disabled={currentSlide === 0}
          className="p-3 rounded-full bg-white dark:bg-slate-800 shadow hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-slate-800 dark:text-white"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400 min-w-[80px] text-center">
          Slide {currentSlide + 1} of {slides.length}
        </div>
        <button 
          onClick={goNext} 
          disabled={currentSlide === slides.length - 1}
          className="p-3 rounded-full bg-white dark:bg-slate-800 shadow hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-slate-800 dark:text-white"
        >
          <ChevronRight size={24} />
        </button>
      </div>
      
      {/* Speaker Notes */}
      {slide.speakerNotes && (
        <div className="w-full max-w-[1024px] mt-6 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
          <p className="text-sm font-bold text-yellow-800 dark:text-yellow-500 mb-1">Speaker Notes:</p>
          <p className="text-sm text-yellow-900 dark:text-yellow-100">{slide.speakerNotes}</p>
        </div>
      )}
    </div>
  );
}
