import { User, Mail, Shield, Smartphone, Globe, Camera, Save, Lock } from 'lucide-react';
import { auth } from '../lib/firebase';
import { motion } from 'motion/react';

export function Profile() {
  const user = auth.currentUser;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="headline-lg text-on-surface">Perfil Profesional</h1>
          <p className="body-md text-on-surface-variant">Gestione su identidad profesional y configuraciones de seguridad.</p>
        </div>
        <button className="px-5 py-2 bg-primary text-white rounded-md text-[12px] font-bold flex items-center gap-2 hover:bg-primary/90 shadow-sm uppercase tracking-widest transition-all">
          <Save size={16} />
          Guardar Cambios
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm text-center">
            <div className="relative inline-block mb-4 group">
              <div className="w-24 h-24 rounded-full border-2 border-primary-container overflow-hidden bg-surface mx-auto">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-primary bg-primary-container">
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0)}
                  </div>
                )}
              </div>
              <button className="absolute bottom-0 right-0 p-1.5 bg-primary text-white rounded-full border-2 border-white shadow-lg hover:bg-primary/90 transition-all">
                <Camera size={12} />
              </button>
            </div>
            <h3 className="text-[16px] font-bold text-on-surface">{user?.displayName || 'Profesional Médico'}</h3>
            <p className="text-[11px] text-on-surface-variant mb-3 uppercase font-bold tracking-wider opacity-60">Cirujano Dentista</p>
            <span className="text-[9px] font-black px-2 py-0.5 bg-tertiary-container text-on-tertiary-container rounded-full uppercase tracking-tighter">Sesión Activa</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-outline-variant shadow-sm">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4 opacity-60">Estadísticas Rápidas</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-medium text-on-surface-variant">Pacientes Totales</span>
                <span className="font-bold text-on-surface">1,248</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-medium text-on-surface-variant">Tratamientos Activos</span>
                <span className="font-bold text-on-surface">12</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-medium text-on-surface-variant">Score de Perfil</span>
                <span className="font-bold text-primary">98/100</span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm">
            <h3 className="text-sm font-bold text-on-surface mb-5 flex items-center gap-2">
              <User size={16} className="text-primary" />
              Información General
            </h3>
            <form className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Nombre de Usuario</label>
                <input type="text" defaultValue={user?.displayName || ''} className="w-full px-3 py-1.5 bg-surface border border-outline-variant rounded text-[13px] focus:ring-1 focus:ring-primary outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Matrícula Prof.</label>
                <input type="text" defaultValue="ML-12345-X" className="w-full px-3 py-1.5 bg-surface border border-outline-variant rounded text-[13px] focus:ring-1 focus:ring-primary outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Teléfono Principal</label>
                <input type="text" defaultValue="+1 (555) 000-1234" className="w-full px-3 py-1.5 bg-surface border border-outline-variant rounded text-[13px] focus:ring-1 focus:ring-primary outline-none" />
              </div>
            </form>
          </div>

          <div className="bg-white p-6 rounded-xl border border-error-container/30 shadow-sm">
            <h3 className="text-sm font-bold text-error mb-5 flex items-center gap-2">
              <Lock size={16} />
              Seguridad y Credenciales
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-surface border border-outline-variant rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-white rounded-md border border-outline-variant"><Mail className="text-on-surface-variant" size={14} /></div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-on-surface">Email de Autenticación</p>
                    <p className="text-[11px] text-on-surface-variant truncate">{user?.email}</p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-primary uppercase underline cursor-pointer tracking-widest">Verificar</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-surface border border-outline-variant rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-white rounded-md border border-outline-variant"><Smartphone className="text-on-surface-variant" size={14} /></div>
                  <div>
                    <p className="text-[12px] font-bold text-on-surface">2FA (SMS)</p>
                    <p className="text-[10px] text-error font-medium">No activo</p>
                  </div>
                </div>
                <button className="bg-primary text-white px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">Activar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
