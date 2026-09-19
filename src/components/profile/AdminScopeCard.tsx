import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Terminal, 
  Settings, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Building,
  Users,
  KeyRound,
  Database,
  Lock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export function AdminScopeCard() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div 
      id="admin-scope-card"
      className="bg-white rounded-2xl border border-primary/20 shadow-xs overflow-hidden"
    >
      {/* Top Banner: Elevated Privilege Context */}
      <div className="bg-primary/5 border-b border-primary/15 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-primary text-white rounded-xl shadow-xs shrink-0 mt-0.5 sm:mt-0">
            <ShieldAlert size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-black text-on-surface uppercase tracking-wider">
                Permisos y Alcance Institucional
              </h2>
              <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/25 rounded-full text-[10px] font-black uppercase tracking-wider">
                Acceso Total
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Esta cuenta cuenta con privilegios de <strong>Superadministrador</strong>. Sus acciones impactan en todas las sedes, profesionales y registros clínicos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <Link
            to="/system/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white hover:bg-primary/90 rounded-xl text-xs font-bold transition-all shadow-2xs"
            title="Ir a Control Maestro"
          >
            <Terminal size={13} />
            <span>Control Maestro</span>
            <ExternalLink size={12} className="opacity-80" />
          </Link>

          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-dim border border-outline-variant text-on-surface rounded-xl text-xs font-bold transition-all shadow-2xs"
            title="Ir a Administración"
          >
            <Settings size={13} />
            <span>Administración</span>
            <ExternalLink size={12} className="opacity-80" />
          </Link>
        </div>
      </div>

      {/* Institutional Impact Notice */}
      <div className="p-4 sm:p-5 space-y-4">
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 text-xs">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">Aviso de impacto organizativo:</p>
            <p className="text-amber-800/90 leading-relaxed">
              Las modificaciones de identidad de clínica, horarios institucionales de referencia o directivas de seguridad se aplican globalmente a toda la organización. Proceda con prudencia.
            </p>
          </div>
        </div>

        {/* Scope Overview Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-surface rounded-xl border border-outline-variant space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-on-surface">
              <Building size={14} className="text-primary" />
              <span>Alcance Organizativo</span>
            </div>
            <p className="text-[11px] text-on-surface-variant leading-tight">
              Toda la organización · Sedes centrales y secundarias.
            </p>
          </div>

          <div className="p-3 bg-surface rounded-xl border border-outline-variant space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-on-surface">
              <Users size={14} className="text-primary" />
              <span>Gestión de Cuentas</span>
            </div>
            <p className="text-[11px] text-on-surface-variant leading-tight">
              Alta, baja y modificación de profesionales, secretarias y staff.
            </p>
          </div>

          <div className="p-3 bg-surface rounded-xl border border-outline-variant space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-on-surface">
              <Database size={14} className="text-primary" />
              <span>Planes y Suscripción</span>
            </div>
            <p className="text-[11px] text-on-surface-variant leading-tight">
              Asignación y sincronización de planes, bonificaciones y facturación.
            </p>
          </div>

          <div className="p-3 bg-surface rounded-xl border border-outline-variant space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-on-surface">
              <Lock size={14} className="text-primary" />
              <span>Seguridad y Auditoría</span>
            </div>
            <p className="text-[11px] text-on-surface-variant leading-tight">
              Acceso a logs inmutables, revocación de tokens y reglas de acceso.
            </p>
          </div>
        </div>

        {/* Collapsible Detailed Permissions Breakdown */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-2 px-3 bg-surface hover:bg-surface-dim border border-outline-variant rounded-xl text-xs font-bold text-on-surface flex items-center justify-between transition-colors cursor-pointer"
            aria-expanded={isExpanded}
            aria-controls="detailed-permissions-panel"
          >
            <span>Detalle completo de módulos visibles y acciones con confirmación</span>
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {isExpanded && (
            <div 
              id="detailed-permissions-panel"
              className="mt-3 p-4 bg-surface rounded-xl border border-outline-variant space-y-4 text-xs"
            >
              <div>
                <h3 className="font-bold text-on-surface uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" /> Módulos y Colecciones Accesibles
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-on-surface-variant text-[11px]">
                  <div className="p-2 bg-white rounded-lg border border-outline-variant/80">
                    <strong className="text-on-surface">Control Maestro:</strong> Métricas globales, altas de médicos, planes de suscripción y referidos.
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-outline-variant/80">
                    <strong className="text-on-surface">Administración General:</strong> Gestión de personal (staff), WhatsApp, respaldos y configuración institucional.
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-outline-variant/80">
                    <strong className="text-on-surface">Panel Clínico & Supervisión:</strong> Indicadores operativos, consultas diarias y tasa de asistencia.
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-outline-variant/80">
                    <strong className="text-on-surface">Agenda, Pacientes y Stock:</strong> Supervisión operativa integral y auditoría de historias clínicas.
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-on-surface uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                  <KeyRound size={13} className="text-amber-600" /> Operaciones Sensibles con Validación de Servidor
                </h3>
                <ul className="list-disc list-inside space-y-1 text-on-surface-variant text-[11px]">
                  <li>Bloqueo o desvinculación de profesionales de la plataforma clínica.</li>
                  <li>Cambio de planes, precios base y descuentos institucionales.</li>
                  <li>Revocación global de sesiones activas y reseteo de claves de acceso.</li>
                  <li>Desconexión del almacenamiento institucional en Google Drive.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
