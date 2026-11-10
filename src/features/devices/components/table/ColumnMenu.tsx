import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, Columns3 } from 'lucide-react';

import { messages } from '@/shared/i18n';
import { Button } from '@/shared/ui';

import { HIDEABLE_COLUMNS } from '../../model/table-url-state';
import { columnLabel } from './columns';

import type { DeviceColumnId } from '../../model/table-url-state';

/**
 * Column visibility menu on Radix DropdownMenu (ADR 0008): a button with `aria-haspopup`, a menu
 * of checkbox items operated with arrows, Space/Enter, Home/End, typeahead and Escape, and focus
 * returned to the button on close. Toggling keeps the menu open.
 */
export function ColumnMenu({
  hidden,
  onChange,
}: {
  hidden: readonly DeviceColumnId[];
  onChange: (hidden: DeviceColumnId[]) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="secondary" size="md">
          <Columns3 aria-hidden="true" />
          {messages.devices.table.columnsMenu}
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={4}
          className="z-dropdown min-w-48 rounded-lg border border-border bg-surface-raised p-1 text-sm text-text shadow-md"
        >
          <Menu.Label className="px-2 py-1.5 text-xs font-medium text-text-muted">
            {messages.devices.table.columnsMenuLabel}
          </Menu.Label>
          {HIDEABLE_COLUMNS.map((column) => (
            <Menu.CheckboxItem
              key={column}
              checked={!hidden.includes(column)}
              onSelect={(event) => {
                event.preventDefault();
              }}
              onCheckedChange={(visible) => {
                onChange(visible ? hidden.filter((id) => id !== column) : [...hidden, column]);
              }}
              className="flex cursor-default items-center gap-2 rounded-md py-1.5 ps-2 pe-3 outline-none select-none data-highlighted:bg-surface-sunken"
            >
              <span className="flex size-4 items-center justify-center">
                <Menu.ItemIndicator>
                  <Check aria-hidden="true" className="size-4 text-accent" />
                </Menu.ItemIndicator>
              </span>
              {columnLabel(column)}
            </Menu.CheckboxItem>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
