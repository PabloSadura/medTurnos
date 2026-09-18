import { Bell, Menu, PanelLeft, Cloud } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { cn } from '../lib/utils';

export function TopAppBar() {
  const { user: authUser, profile } = useAuth();
  const user = auth.currentUser || authUser;
  const { isCollapsed, toggleSidebar, openMobile } = useSidebar();
  const { isConnected: isDriveConnected, connectGoogleDrive, isConnecting: isDriveConnecting } = useGoogleDrive();
  const location = useLocation();

  const getSectionTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/profile')) return 'Mi Perfil';
    if (path.startsWith('/agenda')) return 'Agenda';
    if (path.startsWith('/patients')) return 'Pacientes';
    if (path.startsWith('/treatments')) return 'Tratamientos';
    if (path.startsWith('/inventory')) return 'Inventario';
    if (path.startsWith('/reminders')) return 'Recordatorios';
    if (path.startsWith('/admin') || path.startsWith('/system')) return 'Administración';
    if (path.startsWith('/medical/dashboard')) return 'Panel Clínico';
    return 'MedTurnos';
  };

  const sectionTitle = getSectionTitle();

  const roleBadge = profile?.role === 'admin' 
    ? { label: 'Administrador', bg: 'bg-primary/10 text-primary border-primary/20' }
    : profile?.role === 'secretary'
      ? { label: 'Secretaría', bg: 'bg-amber-100 text-amber-800 border-amber-200' }
      : { label: 'Médico', bg: 'bg-teal-100 text-teal-800 border-teal-200' };

  return (
    <header
      id="top-app-bar"
      className={cn(
        "h-14 bg-white/95 backdrop-blur-md border-b border-outline-variant fixed top-0 right-0 flex items-center justify-between px-3 sm:px-6 lg:px-8 z-40 shrink-0 transition-all duration-300 ease-in-out font-sans",
        isCollapsed ? "lg:left-16" : "lg:left-56",
        "left-0"
      )}
    >
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Menu button for Mobile / Sidebar toggle for Desktop */}
        <button
          id="topbar-sidebar-toggle-btn"
          type="button"
          onClick={() => {
            if (window.innerWidth < 1024) {
              openMobile();
            } else {
              toggleSidebar();
            }
          }}
          className="p-2 rounded-xl text-on-surface-variant hover:text-primary hover:bg-surface border border-transparent hover:border-outline-variant transition-all cursor-pointer flex items-center justify-center min-h-[44px] min-w-[44px] touch-manipulation"
          title="Abrir menú de navegación"
          aria-label="Abrir menú de navegación"
        >
          <Menu className="w-5 h-5 lg:hidden" />
          <PanelLeft className="w-4 h-4 hidden lg:block" />
        </button>

        {/* Mobile reduced logo + Dynamic Section Title */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-white font-black text-[11px] flex items-center justify-center lg:hidden shadow-xs shrink-0 select-none">
            MT
          </div>
          <h1 className="text-sm sm:text-base font-black text-on-surface tracking-tight">
            {sectionTitle}
          </h1>
        </div>
        
        <div className="hidden sm:flex items-center gap-2">
          <span className="bg-primary/5 text-primary text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-primary/10">
            En línea
          </span>
          <span className={cn(
            "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border",
            roleBadge.bg
          )}>
            {roleBadge.label}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {isDriveConnected ? (
          <Link
            to="/profile"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100 transition-all"
            title="Google Drive Conectado. Clic para ver detalles en tu perfil."
          >
            <Cloud className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden md:inline">Drive</span> Conectado
          </Link>
        ) : (
          <button
            id="btn-topbar-connect-drive"
            type="button"
            onClick={() => { void connectGoogleDrive(); }}
            disabled={isDriveConnecting}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-bright text-on-surface-variant border border-outline-variant rounded-full text-[10px] font-bold uppercase tracking-wider hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer disabled:opacity-50"
            title="Conectar cuenta de Google Drive para historias y archivos"
          >
            <Cloud className="w-3.5 h-3.5 text-primary" />
            {isDriveConnecting ? 'Conectando...' : 'Conectar Drive'}
          </button>
        )}

        <button 
          id="topbar-notifications-btn"
          type="button"
          className="p-2 rounded-xl hover:bg-surface text-on-surface-variant transition-all border border-transparent hover:border-outline-variant relative cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
          title="Notificaciones"
          aria-label="Ver notificaciones del sistema"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-white"></span>
        </button>

        <Link
          to="/profile"
          className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-surface border border-transparent hover:border-outline-variant transition-all cursor-pointer min-h-[40px]"
          title="Ir a mi perfil"
          aria-label="Ir a mi perfil"
        >
          <div className="w-8 h-8 rounded-full border border-primary/20 overflow-hidden bg-primary/10 flex-shrink-0 flex items-center justify-center font-bold text-xs text-primary">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Foto de perfil" className="w-full h-full object-cover" />
            ) : (
              user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'
            )}
          </div>
          <span className="hidden md:inline-block text-[11px] font-bold text-on-surface max-w-[110px] truncate">
            {profile?.name || user?.displayName || 'Usuario'}
          </span>
        </Link>
      </div>
    </header>
  );
}
