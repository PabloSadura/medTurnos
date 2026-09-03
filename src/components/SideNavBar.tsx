import { NavLink } from 'react-router-dom';
import { 
  LogOut, 
  UserCircle, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  PanelLeftClose, 
  PanelLeftOpen 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { NAV_ITEMS } from '../lib/navigation';

export function SideNavBar() {
  const { permissions } = useAuth();
  const { 
    isCollapsed, 
    toggleCollapsed, 
    isMobileOpen, 
    closeMobile 
  } = useSidebar();

  const handleLogout = () => signOut(auth);

  const filteredItems = NAV_ITEMS.filter(item => {
    if (permissions.includes(item.id)) return true;
    if (permissions.includes('all')) {
      return !item.id.startsWith('sys_');
    }
    return false;
  });

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          id="sidebar-mobile-backdrop"
          onClick={closeMobile}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Aside */}
      <aside
        id="main-sidebar"
        className={cn(
          "bg-white border-r border-outline-variant h-screen fixed left-0 top-0 flex flex-col z-50 shadow-[4px_0_12px_rgba(0,0,0,0.02)] transition-all duration-300 ease-in-out",
          // Desktop collapsed vs expanded
          isCollapsed ? "lg:w-16" : "lg:w-56",
          // Mobile open vs closed (drawer)
          isMobileOpen 
            ? "translate-x-0 w-64" 
            : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sidebar Header & Brand */}
        <div className={cn(
          "border-b border-surface-bright bg-white transition-all duration-300 flex items-center justify-between",
          isCollapsed ? "p-3 lg:flex-col lg:gap-2" : "p-5"
        )}>
          {/* Brand Info */}
          {!isCollapsed ? (
            <div className="overflow-hidden">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-white font-black text-xs shadow-xs shrink-0">
                  MT
                </div>
                <div>
                  <h1 className="text-xs font-black text-on-surface tracking-[0.18em] uppercase leading-none">
                    MedTurnos
                  </h1>
                  <p className="text-[8px] text-on-surface-variant/60 font-black uppercase tracking-widest mt-0.5 leading-none">
                    Clinic Intelligence
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-black text-xs shadow-xs shrink-0" title="MedTurnos Clinic Intelligence">
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
            className="flex lg:hidden p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-all cursor-pointer"
            title="Cerrar menú"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden bg-white/50 backdrop-blur-sm">
          {!isCollapsed && (
            <div className="px-5 mb-2 text-[9px] font-black uppercase tracking-[0.25em] text-on-surface-variant opacity-40">
              Menú Principal
            </div>
          )}

          <div className="space-y-0.5">
            {filteredItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeMobile}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) => cn(
                  "flex items-center text-[12px] font-bold transition-all duration-200 border-l-[3px]",
                  isCollapsed
                    ? "justify-center px-0 py-3 mx-1.5 rounded-xl border-l-0"
                    : "px-5 py-2.5 border-l-[3px]",
                  isActive 
                    ? isCollapsed
                      ? "bg-primary text-white shadow-xs"
                      : "bg-primary/5 text-primary border-primary shadow-[inset_4px_0_10px_rgba(0,71,141,0.02)]" 
                    : isCollapsed
                      ? "text-on-surface-variant hover:bg-surface hover:text-on-surface"
                      : "text-on-surface-variant hover:bg-surface border-transparent"
                )}
              >
                {({ isActive }) => (
                  <>
                    <item.icon 
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        !isCollapsed && "mr-3",
                        isActive 
                          ? isCollapsed ? "text-white" : "text-primary" 
                          : "text-on-surface-variant opacity-60"
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
        </nav>

        {/* User Footer: Profile & Logout */}
        <div className={cn(
          "mt-auto border-t border-outline-variant bg-surface-bright transition-all duration-300",
          isCollapsed ? "p-2 space-y-1" : "px-4 py-3 space-y-1"
        )}>
          <NavLink
            to="/profile"
            onClick={closeMobile}
            title={isCollapsed ? "Mi Perfil" : undefined}
            className={({ isActive }) => cn(
              "flex items-center text-[12px] font-bold rounded-lg transition-all duration-200",
              isCollapsed ? "justify-center p-2" : "px-3 py-1.5",
              isActive 
                ? "bg-primary text-white shadow-sm" 
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
              "flex items-center w-full text-[12px] font-bold rounded-lg text-error hover:bg-error/5 transition-all duration-200 cursor-pointer",
              isCollapsed ? "justify-center p-2" : "px-3 py-1.5 text-left"
            )}
          >
            <LogOut className={cn("w-4 h-4 shrink-0 text-error/60", !isCollapsed && "mr-2.5")} />
            {!isCollapsed && <span className="truncate">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
