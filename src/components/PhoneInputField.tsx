import { useState, useEffect, useId } from 'react';
import { Phone, ChevronDown, Check } from 'lucide-react';
import { cn } from '../lib/utils';

export interface CountryOption {
  code: string; // ISO 2
  name: string;
  dialCode: string;
  flag: string;
  example: string;
  formatRegex?: RegExp;
}

export const SUPPORTED_COUNTRIES: CountryOption[] = [
  { code: 'AR', name: 'Argentina', dialCode: '+54 9', flag: '🇦🇷', example: '11 2345-6789' },
  { code: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾', example: '99 123 456' },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱', example: '9 1234 5678' },
  { code: 'PY', name: 'Paraguay', dialCode: '+595', flag: '🇵🇾', example: '981 123 456' },
  { code: 'BR', name: 'Brasil', dialCode: '+55', flag: '🇧🇷', example: '11 91234-5678' },
  { code: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴', example: '7123 4567' },
  { code: 'PE', name: 'Perú', dialCode: '+51', flag: '🇵🇪', example: '912 345 678' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴', example: '300 123 4567' },
  { code: 'MX', name: 'México', dialCode: '+52', flag: '🇲🇽', example: '55 1234 5678' },
  { code: 'ES', name: 'España', dialCode: '+34', flag: '🇪🇸', example: '612 34 56 78' },
  { code: 'US', name: 'EE.UU. / Canadá', dialCode: '+1', flag: '🇺🇸', example: '415 555-2671' },
];

interface PhoneInputFieldProps {
  value: string;
  onChange: (fullFormattedValue: string) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  helperText?: string;
  patientVisible?: boolean;
}

/**
 * Normalizes and parses any input string or pasted text into a country dial code and local number.
 */
function parsePhone(raw: string): { country: CountryOption; localNumber: string } {
  if (!raw) {
    return { country: SUPPORTED_COUNTRIES[0], localNumber: '' };
  }

  const clean = raw.trim();

  // Try matching each country's dial code
  for (const c of SUPPORTED_COUNTRIES) {
    const rawDial = c.dialCode.replace(/\s+/g, '');
    if (clean.startsWith(c.dialCode) || clean.startsWith(rawDial)) {
      const rest = clean.slice(clean.startsWith(c.dialCode) ? c.dialCode.length : rawDial.length).trim();
      return { country: c, localNumber: rest };
    }
  }

  // Check if starts with +54 without 9
  if (clean.startsWith('+54') || clean.startsWith('549')) {
    const rest = clean.replace(/^\+?54\s*9?/, '').trim();
    return { country: SUPPORTED_COUNTRIES[0], localNumber: rest };
  }

  // Default to Argentina
  return { country: SUPPORTED_COUNTRIES[0], localNumber: clean };
}

export function PhoneInputField({
  value,
  onChange,
  id: customId,
  label = 'Teléfono de Contacto',
  disabled = false,
  required = false,
  error,
  helperText,
  patientVisible = true,
}: PhoneInputFieldProps) {
  const autoId = useId();
  const inputId = customId || autoId;
  const countrySelectId = `${inputId}-country`;

  const parsed = parsePhone(value);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(parsed.country);
  const [localNumber, setLocalNumber] = useState<string>(parsed.localNumber);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Sync external value changes if not matching
  useEffect(() => {
    const p = parsePhone(value);
    setSelectedCountry(p.country);
    setLocalNumber(p.localNumber);
  }, [value]);

  const handleCountryChange = (newCountry: CountryOption) => {
    setSelectedCountry(newCountry);
    setIsDropdownOpen(false);
    if (!localNumber.trim()) {
      onChange('');
    } else {
      onChange(`${newCountry.dialCode} ${localNumber.trim()}`);
    }
  };

  const handleLocalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalNumber(val);
    if (!val.trim()) {
      onChange('');
    } else {
      onChange(`${selectedCountry.dialCode} ${val.trim()}`);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;

    // Check if user pasted a full number with country code
    const p = parsePhone(pasted);
    if (p.localNumber !== pasted) {
      e.preventDefault();
      setSelectedCountry(p.country);
      setLocalNumber(p.localNumber);
      onChange(`${p.country.dialCode} ${p.localNumber.trim()}`);
    }
  };

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label
          htmlFor={inputId}
          className="text-[11px] font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5"
        >
          <Phone size={13} className="text-primary" />
          <span>{label}</span>
          {required && <span className="text-error font-bold">*</span>}
        </label>
        {patientVisible && (
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Check size={11} /> Visible en WhatsApp
          </span>
        )}
      </div>

      {/* Input Group: Country Selector + Local Number */}
      <div
        className={cn(
          "flex items-stretch rounded-xl border bg-surface transition-all focus-within:ring-2 focus-within:ring-primary/20",
          error
            ? "border-error focus-within:border-error"
            : "border-outline-variant focus-within:border-primary",
          disabled && "opacity-60 bg-surface-variant/30 cursor-not-allowed"
        )}
      >
        {/* Country Selector Dropdown Trigger */}
        <div className="relative shrink-0">
          <button
            type="button"
            id={countrySelectId}
            disabled={disabled}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="h-full px-3 py-2.5 flex items-center gap-1.5 border-r border-outline-variant/60 bg-surface-bright/50 hover:bg-surface-bright rounded-l-xl text-xs font-bold text-on-surface transition-colors cursor-pointer select-none"
            aria-haspopup="listbox"
            aria-expanded={isDropdownOpen}
            aria-label="Seleccionar país para código telefónico"
          >
            <span className="text-base leading-none" role="img" aria-label={selectedCountry.name}>
              {selectedCountry.flag}
            </span>
            <span className="font-mono text-xs text-primary font-bold">{selectedCountry.dialCode}</span>
            <ChevronDown size={14} className={cn("text-on-surface-variant transition-transform", isDropdownOpen && "rotate-180")} />
          </button>

          {/* Accessible Dropdown Menu */}
          {isDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsDropdownOpen(false)}
                aria-hidden="true"
              />
              <ul
                role="listbox"
                aria-label="Lista de países disponibles"
                className="absolute left-0 top-full mt-1.5 w-60 max-h-56 overflow-y-auto bg-white rounded-xl border border-outline-variant shadow-lg z-50 py-1 text-xs divide-y divide-surface-bright"
              >
                {SUPPORTED_COUNTRIES.map((c) => {
                  const isSelected = c.code === selectedCountry.code;
                  return (
                    <li
                      key={c.code}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleCountryChange(c)}
                      className={cn(
                        "px-3 py-2 flex items-center justify-between cursor-pointer transition-colors",
                        isSelected ? "bg-primary/10 text-primary font-bold" : "hover:bg-surface text-on-surface"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{c.flag}</span>
                        <span>{c.name}</span>
                      </div>
                      <span className="font-mono text-[11px] text-on-surface-variant font-semibold">
                        {c.dialCode}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Local Number Input */}
        <div className="flex-1 relative">
          <input
            type="tel"
            id={inputId}
            value={localNumber}
            onChange={handleLocalChange}
            onPaste={handlePaste}
            disabled={disabled}
            placeholder={`Ej: ${selectedCountry.example}`}
            className="w-full h-full px-3.5 py-2.5 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none font-semibold"
          />
        </div>
      </div>

      {/* Helper text or error message */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        {error ? (
          <span className="text-error font-bold">{error}</span>
        ) : (
          <span className="text-on-surface-variant/75">
            {helperText || `Formato sugerido: código de área + número (${selectedCountry.example}). Puede pegar el número completo.`}
          </span>
        )}
        {value && (
          <span className="text-[10px] font-mono font-bold text-primary/80 shrink-0">
            {value}
          </span>
        )}
      </div>
    </div>
  );
}
