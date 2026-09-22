import { useMemo, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LogOut, 
  UserCircle, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  LayoutDashboard,
  CalendarDays,
  Users,
  Stethoscope,
  Package,
  MessageSquare,
  Settings,
  Terminal,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { NAV_ITEMS } from '../lib/navigation';

export function SideNavBar() {
  const { permissions, logout, profile, user } = useAuth();
  const { 
    isCollapsed, 
    toggleCollapsed, 
    isMobileOpen, 
    closeMobile 
  } = useSidebar();

  const handleLogout = () => logout();

  // Close drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        closeMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, closeMobile]);

  const { operationItems, clinicalItems, adminItems } = useMemo(() => {
    const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin' || profile?.role === 'super_admin';
    if (isAdmin) {
      // El administrador tiene acceso exclusivamente al panel de control de administración global
      // Todas las demás opciones (Agenda, Pacientes, Tratamientos, Inventario, Avisos, Panel Clínico) son para los profesionales
      return {
        operationItems: [],
        clinicalItems: [],
        adminItems: [
          { 
            icon: Terminal, 
            label: 'Panel de Control', 
            path: '/system/dashboard', 
            id: 'sys_dashboard', 
            subtitle: 'Gestión global y suscripciones' 
          },
        ]
      };
    }

    const allowed = NAV_ITEMS.filter(item => {
      if (permissions.includes(item.id)) return true;
      if (permissions.includes('all')) {
        return !item.id.startsWith('sys_');
      }
      return false;
    });

    return {
      operationItems: allowed.filter(i => ['agenda', 'patients', 'treatments', 'inventory', 'reminders', 'assistant_agenda'].includes(i.id)),
      clinicalItems: allowed.filter(i => ['dashboard'].includes(i.id)).map(i => ({ ...i, subtitle: 'Métricas clínicas y seguimiento' })),
      adminItems: allowed.filter(i => ['admin', 'sys_dashboard'].includes(i.id)).map(i => ({
        ...i,
        subtitle: i.id === 'sys_dashboard' ? 'Control global' : 'Gestión y staff'
      }))
    };
  }, [permissions, profile?.role]);

  const userRoleLabel = useMemo(() => {
    if (profile?.role === 'admin' || profile?.role === 'superadmin' || profile?.role === 'super_admin') return 'Superadmin · Toda la org.';
    if (profile?.role === 'secretary') return 'Staff Administrativo';
    return 'Profesional Clínico';
  }, [profile?.role]);

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          id="sidebar-mobile-backdrop"
          onClick={closeMobile}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar / Accessible Drawer */}
      <aside
        id="main-sidebar"
        role={isMobileOpen ? "dialog" : "complementary"}
        aria-modal={isMobileOpen ? "true" : undefined}
        aria-label="Menú de navegación principal"
        className={cn(
          "bg-white border-r border-outline-variant h-screen fixed left-0 top-0 flex flex-col z-50 shadow-[4px_0_16px_rgba(0,0,0,0.04)] transition-all duration-300 ease-in-out font-sans",
          // Desktop collapsed vs expanded
          isCollapsed ? "lg:w-16" : "lg:w-56",
          // Mobile open vs closed (drawer)
          isMobileOpen 
            ? "translate-x-0 w-72" 
            : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sidebar Header & Brand */}
        <div className={cn(
          "border-b border-surface-bright bg-white transition-all duration-300 flex items-center justify-between",
          isCollapsed ? "p-3 lg:flex-col lg:gap-2" : "p-4 sm:p-5"
        )}>
          {/* Brand Info */}
          {!isCollapsed ? (
            <div className="overflow-hidden">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white font-black text-xs shadow-xs shrink-0">
                  MT
                </div>
                <div>
                  <h1 className="text-xs font-black text-on-surface tracking-[0.16em] uppercase leading-none">
                    MedTurnos
                  </h1>
                  <p className="text-[9px] text-primary font-bold uppercase tracking-wider mt-1 leading-none">
                    Salud Digital
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-black text-xs shadow-xs shrink-0" title="MedTurnos Salud Digital">
              MT
            </div>
          )}

          {/* Toggle Button for Desktop */}
          <button
            id="sidebar-collapse-toggle-btn"
            type="button"
            onClick={toggleCollapsed}
            className="hidden lg:flex p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface border border-transparent hover:border-outline-variant transition-all cursor-pointer"
            title={isCollapsed ? "Abrir / Expandir menú" : "Cerrar / Contraer menú"}
            aria-label={isCollapsed ? "Abrir menú" : "Cerrar menú"}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          {/* Close Button for Mobile Drawer */}
          <button
            id="sidebar-mobile-close-btn"
            type="button"
            onClick={closeMobile}
            className="flex lg:hidden p-2 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition-all cursor-pointer"
            title="Cerrar menú de navegación"
            aria-label="Cerrar menú de navegación"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items Organized by Operación, Supervisión Clínica & Administración */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden bg-white space-y-4">
          {/* 1. Operación (Solo para profesionales) */}
          {operationItems.length > 0 && (
            <div>
              {!isCollapsed && (
                <div className="px-5 mb-1.5 text-[9px] font-black uppercase tracking-[0.25em] text-on-surface-variant opacity-60">
                  Operación
                </div>
              )}
              <div className="space-y-0.5">
                {operationItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={closeMobile}
                    title={isCollapsed ? item.label : undefined}
                    className={({ isActive }) => cn(
                      "flex items-center text-[12px] font-bold transition-all duration-200 rounded-xl",
                      isCollapsed
                        ? "justify-center p-2.5 mx-1.5"
                        : "px-3.5 py-2 mx-2.5",
                      isActive 
                        ? "bg-primary text-white shadow-xs"
                        : "text-on-surface-variant hover:bg-surface hover:text-on-surface"
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon 
                          className={cn(
                            "w-4 h-4 shrink-0 transition-colors",
                            !isCollapsed && "mr-3",
                            isActive 
                              ? "text-white" 
                              : "text-on-surface-variant opacity-70"
                          )} 
                        />
                        {!isCollapsed && (
                          <span className="tracking-tight truncate">{item.label}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          {/* 2. Supervisión Clínica (Solo para profesionales) */}
          {clinicalItems.length > 0 && (
            <div className={cn(operationItems.length > 0 && "pt-2 border-t border-outline-variant/40")}>
              {!isCollapsed && (
                <div className="px-5 mb-1.5 text-[9px] font-black uppercase tracking-[0.25em] text-on-surface-variant opacity-60">
                  Supervisión Clínica
                </div>
              )}
              <div className="space-y-0.5">
                {clinicalItems.map((item: any) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={closeMobile}
                    title={isCollapsed ? `${item.label} - ${item.subtitle || ''}` : item.subtitle}
                    className={({ isActive }) => cn(
                      "flex items-center text-[12px] font-bold transition-all duration-200 rounded-xl",
                      isCollapsed
                        ? "justify-center p-2.5 mx-1.5"
                        : "px-3.5 py-2 mx-2.5",
                      isActive 
                        ? "bg-primary text-white shadow-xs"
                        : "text-on-surface-variant hover:bg-surface hover:text-on-surface"
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon 
                          className={cn(
                            "w-4 h-4 shrink-0 transition-colors",
                            !isCollapsed && "mr-3",
                            isActive 
                              ? "text-white" 
                              : "text-on-surface-variant opacity-70"
                          )} 
                        />
                        {!isCollapsed && (
                          <div className="min-w-0">
                            <span className="tracking-tight truncate block">{item.label}</span>
                            {item.subtitle && (
                              <span className="text-[10px] font-medium text-on-surface-variant/70 truncate block -mt-0.5">
                                {item.subtitle}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )}

          {/* 3. Panel de Control / Administración */}
          {adminItems.length > 0 && (
            <div className={cn((operationItems.length > 0 || clinicalItems.length > 0) && "pt-2 border-t border-outline-variant/40")}>
              {!isCollapsed && (
                <div className="px-5 mb-1.5 text-[9px] font-black uppercase tracking-[0.25em] text-on-surface-variant opacity-60">
                  {profile?.role === 'admin' ? 'Panel de Control' : 'Administración'}
                </div>
              )}
              <div className="space-y-0.5">
                {adminItems.map((item: any) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={closeMobile}
                    title={isCollapsed ? `${item.label} - ${item.subtitle || ''}` : item.subtitle}
                    className={({ isActive }) => cn(
                      "flex items-center text-[12px] font-bold transition-all duration-200 rounded-xl",
                      isCollapsed
                        ? "justify-center p-2.5 mx-1.5"
                        : "px-3.5 py-2 mx-2.5",
                      isActive 
                        ? "bg-primary text-white shadow-xs"
                        : "text-on-surface-variant hover:bg-surface hover:text-on-surface"
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon 
                          className={cn(
                            "w-4 h-4 shrink-0 transition-colors",
                            !isCollapsed && "mr-3",
                            isActive 
                              ? "text-white" 
                              : "text-on-surface-variant opacity-70"
                          )} 
                        />
                        {!isCollapsed && (
                          <div className="min-w-0">
                            <span className="tracking-tight truncate block">{item.label}</span>
                            {item.subtitle && (
                              <span className="text-[10px] font-medium text-on-surface-variant/70 truncate block -mt-0.5">
                                {item.subtitle}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* User Footer: Profile, Role Badge & Logout */}
        <div className={cn(
          "mt-auto border-t border-outline-variant bg-surface/50 transition-all duration-300",
          isCollapsed ? "p-2 space-y-1" : "p-3 space-y-2"
        )}>
          {!isCollapsed && (
            <div className="px-2 py-1 flex items-center justify-between">
              <div className="truncate pr-1">
                <p className="text-[11px] font-bold text-on-surface truncate leading-tight">
                  {profile?.name || user?.displayName || 'Usuario'}
                </p>
                <span className={cn(
                  "inline-block mt-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-md",
                  profile?.role === 'admin' 
                    ? "bg-primary/10 text-primary"
                    : profile?.role === 'secretary'
                      ? "bg-amber-100 text-amber-800"
                      : "bg-teal-100 text-teal-800"
                )}>
                  {userRoleLabel}
                </span>
              </div>
            </div>
          )}

          <NavLink
            to="/profile"
            onClick={closeMobile}
            title={isCollapsed ? "Mi Perfil" : undefined}
            className={({ isActive }) => cn(
              "flex items-center text-[12px] font-bold rounded-lg transition-all duration-200",
              isCollapsed ? "justify-center p-2" : "px-3 py-2",
              isActive 
                ? "bg-primary text-white shadow-xs" 
                : "text-on-surface-variant hover:bg-surface hover:text-on-surface"
            )}
          >
            {({ isActive }) => (
              <>
                <UserCircle 
                  className={cn(
                    "w-4 h-4 shrink-0", 
                    !isCollapsed && "mr-2.5", 
                    isActive ? "text-white" : "text-on-surface-variant opacity-60"
                  )} 
                />
                {!isCollapsed && <span className="truncate">Mi Perfil</span>}
              </>
            )}
          </NavLink>

          <button
            id="sidebar-logout-btn"
            type="button"
            onClick={handleLogout}
            title={isCollapsed ? "Cerrar Sesión" : undefined}
            className={cn(
              "flex items-center w-full text-[12px] font-bold rounded-lg text-error hover:bg-error/10 transition-all duration-200 cursor-pointer",
              isCollapsed ? "justify-center p-2" : "px-3 py-2 text-left"
            )}
          >
            <LogOut className={cn("w-4 h-4 shrink-0 text-error/80", !isCollapsed && "mr-2.5")} />
            {!isCollapsed && <span className="truncate">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
