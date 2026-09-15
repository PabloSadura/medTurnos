import React, { useState } from 'react';
import { Smile, Sparkles, ChevronDown, Check, Info } from 'lucide-react';
import { EMOJI_PALETTE, QUICK_EMOJIS, interpretEmojis, containsEmojis } from '../lib/whatsappUtils';
import { cn } from '../lib/utils';

interface EmojiToolbarProps {
  onInsertEmoji: (emoji: string) => void;
  previewText?: string;
  className?: string;
  compact?: boolean;
}

export function EmojiToolbar({
  onInsertEmoji,
  previewText,
  className,
  compact = false
}: EmojiToolbarProps) {
  const [showPalette, setShowPalette] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(EMOJI_PALETTE[0].category);

  const hasEmojis = previewText ? (containsEmojis(previewText) || /:[a-zA-Z0-9_-]+:/.test(previewText)) : false;

  return (
    <div className={cn("space-y-2 select-none", className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
            <Smile size={12} className="text-amber-500" />
            <span>Insertar Emojis:</span>
          </span>

          {/* Quick 1-click emoji chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {QUICK_EMOJIS.map(({ emoji, label }) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onInsertEmoji(emoji)}
                className="w-7 h-7 flex items-center justify-center text-sm rounded-lg hover:bg-amber-50 hover:scale-110 active:scale-95 transition-all border border-transparent hover:border-amber-300/80 cursor-pointer shadow-2xs"
                title={`${label} (${emoji})`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Dropdown toggle for full palette */}
          <button
            type="button"
            onClick={() => setShowPalette(!showPalette)}
            className={cn(
              "px-2 py-1 text-[11px] font-semibold rounded-lg border transition-all flex items-center gap-1 cursor-pointer",
              showPalette 
                ? "bg-amber-500/15 border-amber-500/40 text-amber-900" 
                : "border-outline-variant bg-surface hover:bg-surface-bright text-on-surface-variant"
            )}
            title="Ver catálogo completo de emojis por categoría"
          >
            <span>Más</span>
            <ChevronDown size={11} className={cn("transition-transform duration-200", showPalette && "rotate-180")} />
          </button>
        </div>

        {/* Status Indicator */}
        {hasEmojis && (
          <div 
            className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200"
            title="Los emojis y códigos están listos y se interpretarán en WhatsApp nativamente."
          >
            <Check size={11} />
            <span>Emojis compatibles con WhatsApp</span>
          </div>
        )}
      </div>

      {/* Expanded Palette by Category */}
      {showPalette && (
        <div className="p-3 bg-surface border border-outline-variant/80 rounded-xl shadow-md animate-in fade-in slide-in-from-top-1 duration-150 space-y-2.5">
          {/* Category Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-outline-variant/50 scrollbar-none">
            {EMOJI_PALETTE.map((cat) => (
              <button
                key={cat.category}
                type="button"
                onClick={() => setActiveCategory(cat.category)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] font-bold whitespace-nowrap transition-colors cursor-pointer",
                  activeCategory === cat.category
                    ? "bg-primary text-white shadow-2xs"
                    : "text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
                )}
              >
                {cat.category}
              </button>
            ))}
          </div>

          {/* Emojis in active category */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 pt-1">
            {EMOJI_PALETTE.find(c => c.category === activeCategory)?.emojis.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => {
                  onInsertEmoji(item.emoji);
                }}
                className="flex items-center gap-2 p-1.5 rounded-lg border border-outline-variant/60 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group cursor-pointer"
                title={`Insertar ${item.emoji} (${item.code})`}
              >
                <span className="text-base group-hover:scale-120 transition-transform">{item.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-on-surface truncate">{item.label}</p>
                  <p className="text-[8px] text-on-surface-variant/70 font-mono">{item.code}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-outline-variant/40 flex items-center justify-between text-[10px] text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Info size={11} className="text-primary" />
              <span>También puedes escribir códigos como <code>:calendario:</code> o <code>:reloj:</code> directamente en el texto.</span>
            </span>
            <button
              type="button"
              onClick={() => setShowPalette(false)}
              className="text-primary font-bold hover:underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
