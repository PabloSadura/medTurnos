import { Settings, Users, Shield, Database, Bell, Layout, CreditCard, ChevronRight } from 'lucide-react';

export function Administration() {
  const settingsGroups = [
    {
      title: 'Sistema y Acceso',
      items: [
        { label: 'Usuarios y Permisos', desc: 'Gestionar acceso del personal administrativo.', icon: Users },
        { label: 'Seguridad', desc: 'Registros de auditoría y políticas de contraseñas.', icon: Shield },
        { label: 'Copias de Seguridad', desc: 'Exportar base de datos y adjuntos.', icon: Database },
      ]
    },
    {
      title: 'Configuración Clínica',
      items: [
        { label: 'Personalización UI', desc: 'Colores, logos y temas de la plataforma.', icon: Layout },
        { label: 'Notificaciones', desc: 'Plantillas de email y WhatsApp.', icon: Bell },
        { label: 'Facturación', desc: 'Planes, métodos de pago y facturas.', icon: CreditCard },
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="headline-lg text-on-surface">Administración del Sistema</h1>
        <p className="body-md text-on-surface-variant">Configure los parámetros globales de la clínica y gestione el acceso del personal.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {settingsGroups.map((group) => (
          <div key={group.title} className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-70 ml-1">{group.title}</h3>
            <div className="bg-white border border-outline-variant rounded-xl shadow-sm divide-y divide-surface overflow-hidden">
              {group.items.map((item) => (
                <div key={item.label} className="p-4 flex items-center gap-4 hover:bg-surface/50 cursor-pointer transition-colors group">
                  <div className="p-2 bg-surface rounded-lg group-hover:bg-white border border-transparent group-hover:border-outline-variant transition-all">
                    <item.icon size={18} className="text-on-surface-variant" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[13px] font-bold text-on-surface">{item.label}</h4>
                    <p className="text-[11px] text-on-surface-variant">{item.desc}</p>
                  </div>
                  <ChevronRight size={16} className="text-on-surface-variant/40 group-hover:translate-x-0.5 transition-transform" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-primary">Estado de la Suscripción</h3>
          <p className="text-[12px] text-on-surface-variant">Su plan Professional vence en 24 días.</p>
        </div>
        <button className="px-4 py-1.5 bg-primary text-white rounded-md text-[11px] font-bold uppercase tracking-widest shadow-sm hover:bg-primary/90 transition-all">
          Renovar Ahora
        </button>
      </div>
    </div>
  );
}
