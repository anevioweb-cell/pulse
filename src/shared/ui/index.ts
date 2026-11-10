// Public API of the shared UI library. Import components only from '@/shared/ui'.
export * from './Badge';
export * from './Banner';
export * from './Button';
export * from './Card';
export * from './Dialog';
export * from './EmptyState';
export * from './ErrorState';
export * from './IconButton';
export * from './Input';
export * from './KpiCard';
export * from './PageHeader';
export * from './Select';
export * from './Skeleton';
export * from './Spinner';
export * from './StatusIndicator';
export * from './Switch';
export * from './Tabs';
export * from './Toast';
export * from './Tooltip';

// TimeSeriesChart is not re-exported here: import it from '@/shared/ui/TimeSeriesChart'. uPlot runs
// code when its module loads (it reads matchMedia and the pixel ratio), so the barrel must never
// load it; only the lazy device page does.
