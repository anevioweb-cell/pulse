import { messages } from '@/shared/i18n';
import { PageHeader } from '@/shared/ui';

import { DeviceGrid } from '../components/DeviceGrid';
import { KpiRow } from '../components/KpiRow';

export function OverviewPage() {
  return (
    <>
      <PageHeader
        title={messages.pages.overview.title}
        description={messages.pages.overview.description}
      />
      <section aria-labelledby="overview-summary" className="flex flex-col gap-3">
        <h2 id="overview-summary" className="text-lg font-semibold">
          {messages.overview.summaryHeading}
        </h2>
        <KpiRow />
      </section>
      <section aria-labelledby="overview-devices" className="flex flex-col gap-3">
        <h2 id="overview-devices" className="text-lg font-semibold">
          {messages.overview.devicesHeading}
        </h2>
        <DeviceGrid />
      </section>
    </>
  );
}
