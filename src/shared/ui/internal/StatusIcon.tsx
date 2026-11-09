import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

interface StatusIconProps {
  /** `success`, `warning`, `danger` or `info`; anything else renders nothing. */
  status: string;
  className?: string;
}

/**
 * Icon shape for a status, so status is never conveyed by color alone (WCAG 1.4.1). Elements are
 * created inside the component, not in a module-level map: element creation at module scope is a
 * side effect that stops bundlers from tree-shaking the module (and its icons) out of other builds.
 */
export function StatusIcon({ status, className }: StatusIconProps) {
  switch (status) {
    case 'success':
      return <CircleCheck aria-hidden="true" className={className} />;
    case 'warning':
      return <TriangleAlert aria-hidden="true" className={className} />;
    case 'danger':
      return <CircleAlert aria-hidden="true" className={className} />;
    case 'info':
      return <Info aria-hidden="true" className={className} />;
    default:
      return null;
  }
}
