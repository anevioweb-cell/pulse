import { Cpu } from 'lucide-react';

import { useDevices } from '@/features/telemetry';
import { messages } from '@/shared/i18n';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/shared/ui';

import { DevicesTable } from '../components/table/DevicesTable';

function DevicesPanel() {
  const devices = useDevices();
  const { table: text } = messages.devices;
  if (devices.data) {
    if (devices.data.length === 0) {
      return (
        <EmptyState icon={<Cpu />} title={text.emptyTitle} description={text.emptyDescription} />
      );
    }
    return <DevicesTable devices={devices.data} />;
  }
  if (devices.isError) {
    return (
      <ErrorState
        title={text.errorTitle}
        description={text.errorDescription}
        retryLabel={text.retry}
        retrying={devices.isFetching}
        headingLevel="h2"
        onRetry={() => {
          void devices.refetch();
        }}
      />
    );
  }
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      <p className="sr-only">{text.loading}</p>
      <Skeleton className="h-10" />
      <Skeleton shape="rect" className="h-96" />
    </div>
  );
}

export function DevicesPage() {
  return (
    <>
      <PageHeader
        title={messages.pages.devices.title}
        description={messages.pages.devices.description}
      />
      <DevicesPanel />
    </>
  );
}
