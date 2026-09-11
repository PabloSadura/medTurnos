import React, { useState, useEffect } from 'react';
import { cleanArgentineLocalPhone, formatArgentinePhoneWithPrefix } from '../lib/phoneUtils';
import { cn } from '../lib/utils';
import { Phone } from 'lucide-react';

interface PhoneInputArgentinaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  showHelperText?: boolean;
}

export function PhoneInputArgentina({
  value,
  onChange,
  placeholder = 'Ej: 11 1234-5678',
  className,
  id,
  required = false,
  autoFocus = false,
  disabled = false,
  showHelperText = false
}: PhoneInputArgentinaProps) {
  // Extract only the local portion for display inside the input
  const [localValue, setLocalValue] = useState(() => cleanArgentineLocalPhone(value));

  useEffect(() => {
    const cleaned = cleanArgentineLocalPhone(value);
    setLocalValue(cleaned);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Clean any pasted or typed +54 9, 549, 0, etc.
    const cleanedLocal = cleanArgentineLocalPhone(raw);
    setLocalValue(cleanedLocal);

    if (!cleanedLocal) {
      onChange('');
    } else {
      onChange(formatArgentinePhoneWithPrefix(cleanedLocal));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted) {
      e.preventDefault();
      const cleanedLocal = cleanArgentineLocalPhone(pasted);
      setLocalValue(cleanedLocal);
      onChange(formatArgentinePhoneWithPrefix(cleanedLocal));
    }
  };

  return (
    <div className="w-full space-y-1">
      <div 
        className={cn(
          "flex items-center w-full bg-surface border border-outline-variant rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all shadow-xs",
          disabled && "opacity-60 cursor-not-allowed bg-surface-variant/30",
          className
        )}
      >
        {/* Fixed Argentine prefix badge */}
        <div 
          className="flex items-center gap-1.5 px-3 py-2 bg-surface-variant/40 border-r border-outline-variant text-on-surface select-none shrink-0"
          title="Prefijo fijo para Argentina móvil (+54 9) requerido por WhatsApp"
        >
          <span className="text-sm leading-none" role="img" aria-label="Bandera Argentina">🇦🇷</span>
          <span className="text-xs font-bold font-mono tracking-wide text-primary">+54 9</span>
        </div>

        {/* Local Area Code & Number Input */}
        <input
          type="tel"
          id={id}
          value={localValue}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          disabled={disabled}
          className="w-full px-3 py-2 bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant/50 outline-none font-mono"
        />

        <div className="pr-3 text-on-surface-variant/40 shrink-0">
          <Phone size={14} />
        </div>
      </div>

      {showHelperText && (
        <p className="text-[10px] text-on-surface-variant flex items-center justify-between px-0.5">
          <span>Prefijo <b>+54 9</b> fijo. Ingrese área y número (ej: 11 2345 6789).</span>
          {localValue.replace(/\D/g, '').length > 0 && (
            <span className="font-mono font-medium text-primary">
              {localValue.replace(/\D/g, '').length} dígitos
            </span>
          )}
        </p>
      )}
    </div>
  );
}
