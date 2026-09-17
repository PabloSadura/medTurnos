import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  CalendarDays, 
  Users, 
  MessageSquare, 
  LayoutDashboard, 
  Menu,
  Terminal
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { cn } from '../lib/utils';

export function BottomNavBar() {
  const { profile, permissions } = useAuth();
  const { toggleMobile, closeMobile, isMobileOpen } = useSidebar();
  const location = useLocation();

  const isAdmin = profile?.role === 'admin';

  // Core navigation items for quick thumb access on mobile
  const navItems = [
    {
      to: '/agenda',
      label: 'Agenda',
      icon: CalendarDays,
      permission: 'agenda'
    },
    {
      to: '/patients',
      label: 'Pacientes',
      icon: Users,
      permission: 'patients'
    },
    {
      to: '/reminders',
      label: 'Avisos',
      icon: MessageSquare,
      permission: 'reminders'
    },
    {
      to: isAdmin ? '/system/dashboard' : '/dashboard',
      label: isAdmin ? 'Admin' : 'Inicio',
      icon: isAdmin ? Terminal : LayoutDashboard,
      permission: isAdmin ? 'sys_dashboard' : 'dashboard'
    }
  ];

  // Filter items based on user permissions
  const visibleItems = navItems.filter(item => {
    if (isAdmin) return true;
    if (permissions.includes('all')) return true;
    return permissions.includes(item.permission);
  });

  return (
    <nav
      id="mobile-bottom-navigation"
      aria-label="Navegación móvil"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-outline-variant shadow-[0_-4px_16px_rgba(0,0,0,0.04)] lg:hidden transition-transform duration-200"
    >
      <div className="grid grid-cols-5 h-15 max-w-lg mx-auto px-1 items-center">
        {visibleItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMobile}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 min-h-[48px] touch-manipulation cursor-pointer",
                isActive 
                  ? "text-primary font-bold" 
                  : "text-on-surface-variant/70 hover:text-on-surface font-medium"
              )}
            >
              <div className="relative">
                <Icon size={19} className={cn("transition-transform", isActive && "scale-110 text-primary")} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
                )}
              </div>
              <span className={cn(
                "text-[10px] mt-0.5 tracking-tight truncate max-w-[62px]",
                isActive ? "font-bold text-primary" : "text-on-surface-variant font-medium"
              )}>
                {item.label}
              </span>
            </NavLink>
          );
        })}

        {/* More / Menu Drawer Toggle Button */}
        <button
          id="btn-mobile-more-menu"
          type="button"
          onClick={toggleMobile}
          aria-label="Abrir menú completo"
          className={cn(
            "flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 min-h-[48px] touch-manipulation cursor-pointer",
            isMobileOpen 
              ? "text-primary font-bold bg-primary/10" 
              : "text-on-surface-variant/70 hover:text-on-surface font-medium"
          )}
        >
          <Menu size={19} className={cn("transition-transform", isMobileOpen && "scale-110 text-primary")} />
          <span className={cn(
            "text-[10px] mt-0.5 tracking-tight",
            isMobileOpen ? "font-bold text-primary" : "text-on-surface-variant font-medium"
          )}>
            Menú
          </span>
        </button>
      </div>
    </nav>
  );
}
