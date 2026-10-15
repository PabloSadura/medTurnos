import { useState, useRef, useEffect } from 'react';
import { Bell, Menu, PanelLeft, Cloud, AlertTriangle, CreditCard, Sparkles, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { useGoogleDrive } from '../contexts/GoogleDriveContext';
import { useSystemNotifications } from '../hooks/useSystemNotifications';
import { cn } from '../lib/utils';

export function TopAppBar() {
  const { user: authUser, profile } = useAuth();
  const user = auth.currentUser || authUser;
  const { isCollapsed, toggleSidebar, openMobile } = useSidebar();
  const { isConnected: isDriveConnected, connectGoogleDrive, isConnecting: isDriveConnecting } = useGoogleDrive();
  const {
    notifications,
    totalCount,
    hasNotifications,
    hasCriticalAlerts,
    markAsRead,
    markAllAsRead
  } = useSystemNotifications();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    if (isNotifOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotifOpen]);

  // Close dropdown on route change
  useEffect(() => {
    setIsNotifOpen(false);
  }, [location.pathname, location.search]);

  const getSectionTitle = () => {
    const path = location.pathname;
    if (path.startsWith('/profile')) return 'Mi Perfil';
    if (path.startsWith('/agenda')) return 'Agenda';
    if (path.startsWith('/patients')) return 'Pacientes';
    if (path.startsWith('/treatments')) return 'Tratamientos';
    if (path.startsWith('/inventory')) return 'Inventario';
    if (path.startsWith('/reminders')) return 'Recordatorios';
    if (path.startsWith('/system')) return 'Panel de Control Administrador';
    if (path.startsWith('/admin')) return 'Administración';
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

        {/* Dynamic Notifications Icon & Dropdown */}
        <div className="relative" ref={notifContainerRef}>
          <button 
            id="topbar-notifications-btn"
            type="button"
            onClick={() => setIsNotifOpen((prev) => !prev)}
            className={cn(
              "p-2 rounded-xl transition-all border relative cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center",
              isNotifOpen
                ? "bg-primary/10 text-primary border-primary/30"
                : hasCriticalAlerts
                  ? "bg-amber-50/70 text-amber-700 border-amber-200/80 hover:bg-amber-100/70"
                  : hasNotifications
                    ? "bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                    : "hover:bg-surface text-on-surface-variant border-transparent hover:border-outline-variant"
            )}
            title={
              hasNotifications
                ? `${totalCount} ${totalCount === 1 ? 'notificación activa' : 'notificaciones activas'}`
                : "Sin notificaciones pendientes"
            }
            aria-label="Ver notificaciones del sistema"
          >
            <Bell className={cn("w-4 h-4 transition-transform", hasNotifications && "scale-105")} />
            {hasNotifications && (
              <span
                className={cn(
                  "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center ring-2 ring-white shadow-xs",
                  hasCriticalAlerts ? "bg-error" : "bg-primary"
                )}
              >
                {totalCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-outline-variant shadow-xl z-50 overflow-hidden font-sans">
              <div className="px-4 py-3 bg-surface-bright border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-on-surface">
                    Notificaciones Activas
                  </h3>
                  {hasNotifications && (
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-full",
                      hasCriticalAlerts
                        ? "bg-error/10 text-error"
                        : "bg-primary/10 text-primary"
                    )}>
                      {totalCount}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-1.5">
                  {hasNotifications && (
                    <button
                      type="button"
                      onClick={() => markAllAsRead()}
                      className="text-[10px] font-bold text-primary hover:text-primary/80 px-2 py-1 hover:bg-primary/5 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                      title="Marcar todas las notificaciones como leídas"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Marcar leídas</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsNotifOpen(false)}
                    className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface transition-colors cursor-pointer"
                    aria-label="Cerrar panel de notificaciones"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-outline-variant/60">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-on-surface">Todo al día</p>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      No hay alertas pendientes de stock bajo ni facturas próximas a vencer.
                    </p>
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const isStock = notif.type === 'stock';
                    const isInvoice = notif.type === 'invoice';
                    const isMotivational = notif.type === 'motivational';

                    return (
                      <div
                        key={notif.id}
                        className="w-full text-left p-3.5 hover:bg-surface transition-colors flex items-start gap-3 group relative"
                      >
                        <div
                          className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                            isInvoice
                              ? "bg-amber-100 text-amber-800"
                              : isStock
                                ? "bg-error/10 text-error"
                                : "bg-primary/10 text-primary"
                          )}
                        >
                          {isInvoice && <CreditCard className="w-4 h-4" />}
                          {isStock && <AlertTriangle className="w-4 h-4" />}
                          {isMotivational && <Sparkles className="w-4 h-4" />}
                        </div>

                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => {
                            setIsNotifOpen(false);
                            navigate(notif.link);
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded",
                                isInvoice
                                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                                  : isStock
                                    ? "bg-error/10 text-error border border-error/20"
                                    : "bg-primary/10 text-primary border border-primary/20"
                              )}
                            >
                              {isInvoice
                                ? "Facturación"
                                : isStock
                                  ? "Stock Bajo"
                                  : "Motivación del Día"}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-medium truncate">
                              {notif.time}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-on-surface mt-1 leading-snug">
                            {notif.title}
                          </p>
                          <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
                            {notif.message}
                          </p>
                        </div>

                        <div className="flex flex-col items-center gap-1 shrink-0 self-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notif.id);
                            }}
                            className="p-1 rounded-lg text-on-surface-variant/60 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Marcar como leída"
                            aria-label="Marcar como leída"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsNotifOpen(false);
                              navigate(notif.link);
                            }}
                            className="p-1 text-on-surface-variant/40 group-hover:text-primary transition-colors cursor-pointer"
                            title="Ir al módulo"
                            aria-label="Ir al módulo"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-4 py-2.5 bg-surface-bright border-t border-outline-variant flex items-center justify-between">
                <span className="text-[10px] text-on-surface-variant font-medium">
                  Stock bajo • Vencimientos • Turnos de hoy
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsNotifOpen(false);
                    navigate('/admin?tab=notifications');
                  }}
                  className="text-[10px] font-black text-primary uppercase tracking-wider hover:underline cursor-pointer"
                >
                  Ver panel
                </button>
              </div>
            </div>
          )}
        </div>

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
