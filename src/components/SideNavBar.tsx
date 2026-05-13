import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Users, 
  Stethoscope, 
  Package, 
  MessageSquare, 
  Settings, 
  UserCircle, 
  LogOut,
  Activity
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';

const navItems = [
  { icon: LayoutDashboard, label: 'Panel Principal', path: '/' },
  { icon: CalendarDays, label: 'Agenda Diaria', path: '/agenda' },
  { icon: Users, label: 'Pacientes', path: '/patients' },
  { icon: Stethoscope, label: 'Tratamientos', path: '/treatments' },
  { icon: Package, label: 'Inventario', path: '/inventory' },
  { icon: MessageSquare, label: 'Recordatorios', path: '/reminders' },
  { icon: Settings, label: 'Administración', path: '/admin' },
];

export function SideNavBar() {
  const handleLogout = () => signOut(auth);

  return (
    <aside className="w-56 bg-white border-r border-outline-variant h-screen fixed left-0 top-0 flex flex-col z-50 shadow-[4px_0_12px_rgba(0,0,0,0.02)]">
      <div className="p-6 border-b border-surface-bright bg-white">
        <h1 className="text-sm font-black text-on-surface tracking-[0.2em] uppercase">MedTurnos</h1>
        <p className="text-[9px] text-on-surface-variant/40 mt-0.5 font-black uppercase tracking-widest">Clinic Intelligence</p>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto bg-white/50 backdrop-blur-sm">
        <div className="px-6 mb-3 text-[9px] font-black uppercase tracking-[0.25em] text-on-surface-variant opacity-40">Menú Principal</div>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex items-center px-6 py-2.5 text-[12px] font-bold transition-all duration-200 border-l-[3px]",
              isActive 
                ? "bg-primary/5 text-primary border-primary shadow-[inset_4px_0_10px_rgba(0,71,141,0.02)]" 
                : "text-on-surface-variant hover:bg-surface border-transparent"
            )}
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn("w-4 h-4 mr-3 transition-colors", isActive ? "text-primary" : "text-on-surface-variant opacity-60")} />
                <span className="tracking-tight">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 mt-auto border-t border-outline-variant bg-surface-bright">
        <NavLink
          to="/profile"
          className={({ isActive }) => cn(
            "flex items-center px-4 py-1.5 text-[12px] font-bold rounded-md transition-all duration-200 mb-1",
            isActive 
              ? "bg-primary text-white shadow-sm" 
              : "text-on-surface-variant hover:bg-surface"
          )}
        >
          {({ isActive }) => (
            <>
              <UserCircle className={cn("w-4 h-4 mr-3", isActive ? "text-white" : "text-on-surface-variant opacity-60")} />
              <span>Mi Perfil</span>
            </>
          )}
        </NavLink>
        <button
          onClick={handleLogout}
          className="flex items-center w-full px-4 py-1.5 text-[12px] font-bold rounded-md text-error hover:bg-error/5 transition-all duration-200 text-left"
        >
          <LogOut className="w-4 h-4 mr-3 text-error/60" />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
