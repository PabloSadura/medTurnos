import { useState } from 'react';
import { 
  X, 
  Building, 
  MapPin, 
  Phone, 
  ShieldCheck, 
  CheckCircle2, 
  MessageSquare, 
  User, 
  Calendar 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface PatientPublicProfilePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  specialty: string;
  licenseNumber: string;
  clinicName: string;
  clinicAddress: string;
  phone: string;
  photoURL?: string;
}

export function PatientPublicProfilePreview({
  isOpen,
  onClose,
  displayName,
  specialty,
  licenseNumber,
  clinicName,
  clinicAddress,
  phone,
  photoURL,
}: PatientPublicProfilePreviewProps) {
  const [activeView, setActiveView] = useState<'card' | 'whatsapp'>('whatsapp');

  if (!isOpen) return null;

  const sampleDate = 'Martes 24 de Septiembre - 15:30 hs';

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs font-sans"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        role="presentation"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-2xl border border-outline-variant shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[92vh]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="patient-preview-title"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-outline-variant bg-surface-bright flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                Simulación para el Paciente
              </span>
              <h3 id="patient-preview-title" className="text-sm sm:text-base font-bold text-on-surface">
                Cómo visualizan tus datos clínicos
              </h3>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors cursor-pointer"
              aria-label="Cerrar vista previa del paciente"
            >
              <X size={18} />
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="px-5 pt-3 pb-1 flex gap-2 border-b border-outline-variant/60 bg-surface">
            <button
              type="button"
              onClick={() => setActiveView('whatsapp')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                activeView === 'whatsapp'
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white"
              )}
            >
              <MessageSquare size={13} />
              <span>Recordatorio WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('card')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                activeView === 'card'
                  ? "bg-primary text-white shadow-xs"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-white"
              )}
            >
              <User size={13} />
              <span>Tarjeta del Profesional</span>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-4">
            {activeView === 'whatsapp' ? (
              <div className="space-y-3">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Así se compondrá el mensaje de WhatsApp enviado a tus pacientes cuando se confirme o recuerde un turno:
                </p>

                {/* WhatsApp Chat Simulation */}
                <div className="rounded-2xl bg-[#EFEAE2] p-4 sm:p-5 border border-emerald-200/60 shadow-inner">
                  {/* WhatsApp bubble */}
                  <div className="bg-white rounded-2xl rounded-tl-xs p-4 shadow-sm border border-black/5 max-w-sm ml-0 text-xs text-slate-800 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 pb-1 border-b border-slate-100">
                      <CheckCircle2 size={13} />
                      <span>{clinicName || 'MedTurnos Salud'}</span>
                    </div>

                    <p className="leading-relaxed">
                      ¡Hola <strong>Lucía Gómez</strong>! Le recordamos su turno médico agendado:
                    </p>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 space-y-1 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-900 font-bold">
                        <Calendar size={13} className="text-emerald-600 shrink-0" />
                        <span>{sampleDate}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <User size={13} className="text-emerald-600 shrink-0" />
                        <span>{displayName || 'Dr. Profesional'} {specialty ? `(${specialty})` : ''}</span>
                      </div>
                      <div className="flex items-start gap-1.5 text-slate-700">
                        <MapPin size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>Dirección:</strong> {clinicAddress || 'Sin dirección configurada (complete el campo en su perfil)'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-normal">
                      Por favor responda a este mensaje si necesita reprogramar o comuníquese al {phone || 'teléfono del consultorio'}.
                    </p>

                    <div className="text-[9px] text-slate-400 text-right font-mono">
                      10:45 AM • Entregado
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <span className="font-bold text-amber-700">Tip clínico:</span>
                  <span>
                    El texto de la dirección se inserta directamente en la variable <code>&#123;direccion&#125;</code> para que el paciente sepa con exactitud a qué sede concurrir.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Ficha médica pública y membrete de historia clínica:
                </p>

                {/* Simulated Patient Card */}
                <div className="bg-gradient-to-b from-primary/5 to-surface-bright rounded-2xl border border-primary/20 p-5 space-y-4 shadow-sm">
                  <div className="flex items-center gap-3.5">
                    <div className="w-16 h-16 rounded-2xl border-2 border-white shadow-md bg-primary text-white flex items-center justify-center text-xl font-bold overflow-hidden shrink-0">
                      {photoURL ? (
                        <img src={photoURL} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        displayName.charAt(0).toUpperCase() || 'P'
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-base font-black text-on-surface truncate">
                          {displayName || 'Nombre del Profesional'}
                        </h4>
                        <span title="Profesional Matriculado Verificado" className="inline-flex">
                          <ShieldCheck size={16} className="text-primary shrink-0" />
                        </span>
                      </div>
                      <p className="text-xs font-bold text-primary truncate">
                        {specialty || 'Especialidad Médica'}
                      </p>
                      {licenseNumber && (
                        <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                          Matrícula: <span className="font-bold text-on-surface">{licenseNumber}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-primary/10 text-xs">
                    <div className="flex items-start gap-2.5 text-on-surface">
                      <Building size={14} className="text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] uppercase font-black tracking-wider text-on-surface-variant block">
                          Consultorio / Sede
                        </span>
                        <span className="font-semibold">{clinicName || 'Sin consultorio especificado'}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-on-surface">
                      <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] uppercase font-black tracking-wider text-on-surface-variant block">
                          Dirección de Atención
                        </span>
                        <span className="font-semibold">{clinicAddress || 'Sin dirección registrada'}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 text-on-surface">
                      <Phone size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] uppercase font-black tracking-wider text-on-surface-variant block">
                          Contacto de Pacientes
                        </span>
                        <span className="font-semibold font-mono">{phone || 'Sin teléfono configurado'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-outline-variant bg-surface-bright flex justify-end">
            <button
              onClick={onClose}
              type="button"
              className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all cursor-pointer min-h-[40px]"
            >
              Cerrar Vista Previa
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
