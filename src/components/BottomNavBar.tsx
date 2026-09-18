import { NavLink, useLocation } from 'react-router-dom';
import { 
  CalendarDays, 
  Users, 
  MessageSquare, 
  LayoutDashboard, 
  UserCircle,
  Terminal
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import { cn } from '../lib/utils';

export function BottomNavBar() {
  const { profile } = useAuth();
  const { closeMobile } = useSidebar();
  const location = useLocation();

  const isAdmin = profile?.role === 'admin';

  // 5 core navigation items for quick mobile access with clear labels
  const navItems = [
    {
      to: isAdmin ? '/system/dashboard' : '/medical/dashboard',
      label: 'Inicio',
      icon: isAdmin ? Terminal : LayoutDashboard,
    },
    {
      to: '/agenda',
      label: 'Agenda',
      icon: CalendarDays,
    },
    {
      to: '/patients',
      label: 'Pacientes',
      icon: Users,
    },
    {
      to: '/reminders',
      label: 'Avisos',
      icon: MessageSquare,
    },
    {
      to: '/profile',
      label: 'Perfil',
      icon: UserCircle,
    }
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      aria-label="Navegación móvil"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-outline-variant shadow-[0_-4px_16px_rgba(0,0,0,0.04)] lg:hidden transition-transform duration-200 pb-safe font-sans"
    >
      <div className="grid grid-cols-5 h-15 max-w-lg mx-auto px-1 items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMobile}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-0.5 rounded-xl transition-all duration-150 min-h-[48px] touch-manipulation",
                isActive ? "text-primary font-bold" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              <div className="relative">
                <Icon size={19} className={cn("transition-transform", isActive && "scale-110 text-primary")} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
                )}
              </div>
              <span className={cn(
                "text-[10px] mt-0.5 tracking-tight truncate max-w-[62px] select-none",
                isActive ? "font-black text-primary" : "text-on-surface-variant font-medium"
              )}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
