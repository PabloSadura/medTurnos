import { Outlet } from 'react-router-dom';
import { SideNavBar } from './SideNavBar';
import { TopAppBar } from './TopAppBar';

export function MainLayout() {
  return (
    <div className="min-h-screen bg-surface-bright selection:bg-primary/10">
      <SideNavBar />
      <div className="pl-56">
        <TopAppBar />
        <main className="pt-20 pb-12 px-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
