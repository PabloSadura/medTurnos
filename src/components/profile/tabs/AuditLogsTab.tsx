import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  RefreshCw, 
  Shield, 
  Calendar, 
  User, 
  Clock, 
  AlertCircle,
  Filter,
  CheckCircle2,
  Lock,
  ChevronRight,
  Database
} from 'lucide-react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { AuditLogEntry } from '../../../types/profile';
import { cn } from '../../../lib/utils';

export function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>('all');

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      // First attempt: API endpoint
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          const res = await fetch('/api/audit/logs?limit=50', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              setLogs(data);
              setLoading(false);
              return;
            }
          }
        } catch {
          // Fallback to Firestore client SDK query
        }
      }

      // Firestore fallback
      const q = query(
        collection(db, 'audit_logs'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const items: AuditLogEntry[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      }));
      setLogs(items);
    } catch (err: any) {
      console.warn('Audit logs fetch note:', err);
      // If index is building or empty, show empty state gracefully
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    if (filterAction === 'all') return true;
    return log.action?.toLowerCase().includes(filterAction.toLowerCase()) || log.section?.toLowerCase().includes(filterAction.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header and Filter Controls */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-outline-variant shadow-xs space-y-4">
        <div className="border-b border-outline-variant/60 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-wider">
                Registro Inmutable de Auditoría
              </h3>
              <p className="text-xs text-on-surface-variant">
                Trazabilidad de cambios organizacionales, accesos y configuraciones del superadministrador.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="px-3 py-1.5 bg-surface hover:bg-surface-dim border border-outline-variant rounded-xl text-xs font-bold text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-bold text-on-surface-variant flex items-center gap-1">
            <Filter size={13} /> Filtrar por:
          </span>
          <button
            type="button"
            onClick={() => setFilterAction('all')}
            className={cn(
              "px-3 py-1 rounded-lg font-bold transition-all cursor-pointer",
              filterAction === 'all' 
                ? "bg-primary text-white shadow-2xs" 
                : "bg-surface text-on-surface-variant hover:bg-surface-dim border border-outline-variant"
            )}
          >
            Todos ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterAction('perfil')}
            className={cn(
              "px-3 py-1 rounded-lg font-bold transition-all cursor-pointer",
              filterAction === 'perfil' 
                ? "bg-primary text-white shadow-2xs" 
                : "bg-surface text-on-surface-variant hover:bg-surface-dim border border-outline-variant"
            )}
          >
            Perfil y Sede
          </button>
          <button
            type="button"
            onClick={() => setFilterAction('seguridad')}
            className={cn(
              "px-3 py-1 rounded-lg font-bold transition-all cursor-pointer",
              filterAction === 'seguridad' 
                ? "bg-primary text-white shadow-2xs" 
                : "bg-surface text-on-surface-variant hover:bg-surface-dim border border-outline-variant"
            )}
          >
            Seguridad y Claves
          </button>
          <button
            type="button"
            onClick={() => setFilterAction('horario')}
            className={cn(
              "px-3 py-1 rounded-lg font-bold transition-all cursor-pointer",
              filterAction === 'horario' 
                ? "bg-primary text-white shadow-2xs" 
                : "bg-surface text-on-surface-variant hover:bg-surface-dim border border-outline-variant"
            )}
          >
            Horarios
          </button>
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="bg-white rounded-2xl border border-outline-variant shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center space-y-2">
            <RefreshCw size={24} className="animate-spin text-primary mx-auto" />
            <p className="text-xs text-on-surface-variant font-bold">Cargando registros de auditoría...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Database size={28} className="text-on-surface-variant/40 mx-auto" />
            <p className="text-xs font-bold text-on-surface">No hay eventos registrados en este filtro</p>
            <p className="text-[11px] text-on-surface-variant">
              Los cambios que realice en el perfil, claves o sesiones quedarán registrados aquí de forma inmutable.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/60">
            {filteredLogs.map((item) => (
              <div key={item.id} className="p-4 sm:p-5 hover:bg-surface/50 transition-colors space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-on-surface tracking-tight uppercase text-[11px] px-2 py-0.5 bg-primary/10 text-primary rounded-md">
                      {item.action || 'MODIFICACIÓN'}
                    </span>
                    <span className="font-bold text-on-surface">
                      {item.section || 'General'}
                    </span>
                    <span className="text-outline-variant">•</span>
                    <span className="text-on-surface-variant font-medium">
                      Por: <strong className="text-on-surface">{item.authorName || item.authorEmail || 'Superadministrador'}</strong>
                    </span>
                  </div>

                  <span className="text-[11px] text-on-surface-variant font-mono flex items-center gap-1 shrink-0">
                    <Clock size={12} className="opacity-70" />
                    {item.createdAt ? new Date(item.createdAt).toLocaleString('es-AR') : 'Reciente'}
                  </span>
                </div>

                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {item.details}
                </p>

                {item.clientIp && (
                  <div className="text-[10px] text-on-surface-variant/70 font-mono">
                    IP: {item.clientIp} {item.userAgent ? `• ${item.userAgent.slice(0, 40)}...` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
