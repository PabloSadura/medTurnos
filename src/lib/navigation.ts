import { 
  LayoutDashboard, 
  CalendarDays, 
  Users, 
  Stethoscope, 
  Package, 
  MessageSquare, 
  Settings 
} from 'lucide-react';

export const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Panel Principal', path: '/', id: 'dashboard' },
  { icon: CalendarDays, label: 'Agenda Diaria', path: '/agenda', id: 'agenda' },
  { icon: Users, label: 'Pacientes', path: '/patients', id: 'patients' },
  { icon: Stethoscope, label: 'Tratamientos', path: '/treatments', id: 'treatments' },
  { icon: Package, label: 'Inventario', path: '/inventory', id: 'inventory' },
  { icon: MessageSquare, label: 'Recordatorios', path: '/reminders', id: 'reminders' },
  { icon: Settings, label: 'Administración', path: '/admin', id: 'admin' },
];
