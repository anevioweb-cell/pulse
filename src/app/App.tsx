import { messages } from '@/shared/i18n';

import { DataSourceControl } from './shell/DataSourceControl';
import { SimulatedDataBadge } from './shell/SimulatedDataBadge';

export function App() {
  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <p className="me-auto text-lg font-semibold">{messages.app.name}</p>
        <SimulatedDataBadge />
        <DataSourceControl />
      </header>
      <main className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-4xl font-semibold">{messages.app.name}</h1>
      </main>
    </>
  );
}
