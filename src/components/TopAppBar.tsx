import { Bell, Menu, PanelLeft, Cloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useSidebar } from '../contexts/SidebarContext';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { cn } from '../lib/utils';

export function TopAppBar() {
  const user = auth.currentUser;
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { isConnected: isDriveConnected, connectGoogleDrive, isConnecting: isDriveConnecting } = useGoogleDrive();

  return (
    <header
      id="top-app-bar"
      className={cn(
        "h-14 bg-white/85 backdrop-blur-md border-b border-outline-variant fixed top-0 right-0 flex items-center justify-between px-4 sm:px-6 lg:px-8 z-40 shrink-0 transition-all duration-300 ease-in-out",
        isCollapsed ? "lg:left-16" : "lg:left-56",
        "left-0"
      )}
    >
      <div className="flex items-center gap-3">
        {/* Sidebar Toggler Button in Top Bar */}
        <button
          id="topbar-sidebar-toggle-btn"
          type="button"
          onClick={toggleSidebar}
          className="p-2 rounded-xl text-on-surface-variant hover:text-primary hover:bg-surface border border-transparent hover:border-outline-variant transition-all cursor-pointer flex items-center justify-center shadow-2xs"
          title={isCollapsed ? "Abrir menú lateral" : "Contraer menú lateral"}
          aria-label="Alternar menú lateral"
        >
          <Menu className="w-4 h-4 lg:hidden" />
          <PanelLeft className="w-4 h-4 hidden lg:block" />
        </button>

        <h2 className="text-[14px] font-bold text-on-surface tracking-tight">Centro de Control</h2>
        <span className="hidden sm:inline-block bg-primary/5 text-primary text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-primary/10">
          Sincronizado
        </span>
      </div>

      <div className="flex items-center gap-3">
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
          className="p-1.5 rounded-lg hover:bg-surface text-on-surface-variant transition-all border border-transparent hover:border-outline-variant relative cursor-pointer"
          title="Notificaciones"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-error rounded-full border-2 border-white"></span>
        </button>

        <div className="w-7 h-7 rounded-full border border-primary/20 overflow-hidden bg-surface flex-shrink-0 ml-1">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-[10px] text-primary bg-primary-container">
              {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
