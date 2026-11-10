import { Bell, Cpu, LayoutDashboard, Settings } from 'lucide-react';
import { NavLink } from 'react-router';

import { messages } from '@/shared/i18n';

import { ROUTES } from '../router/paths';

const ITEMS = [
  { to: ROUTES.overview, label: messages.nav.overview, Icon: LayoutDashboard, end: true },
  { to: ROUTES.devices, label: messages.nav.devices, Icon: Cpu, end: false },
  { to: ROUTES.alerts, label: messages.nav.alerts, Icon: Bell, end: false },
  { to: ROUTES.settings, label: messages.nav.settings, Icon: Settings, end: false },
] as const;

/**
 * The app's one navigation landmark. Below `lg` it is a bottom bar fixed to the viewport (icons
 * with short labels); from `lg` it is a sticky sidebar. One element for both layouts, so assistive
 * technology never sees two "Main" navigations. NavLink sets `aria-current="page"`.
 */
export function MainNav({ className }: { className?: string }) {
  return (
    <nav aria-label={messages.nav.label} className={className}>
      <ul className="grid grid-cols-4 gap-1 lg:flex lg:flex-col">
        {ITEMS.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-xs text-text-muted transition-colors duration-fast hover:bg-surface-sunken hover:text-text aria-[current=page]:bg-surface-sunken aria-[current=page]:font-semibold aria-[current=page]:text-accent lg:min-h-10 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm"
            >
              <Icon aria-hidden="true" className="size-5 shrink-0 lg:size-4" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
