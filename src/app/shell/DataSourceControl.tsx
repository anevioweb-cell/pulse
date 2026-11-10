import { Radio } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { messages } from '@/shared/i18n';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Switch,
} from '@/shared/ui';

import { PREFERENCES } from '../config';
import { useAppSession } from '../session/session-context';

import type { LiveUrlProblem } from '../session/preferences';
import type { SubmitEvent } from 'react';

function problemMessage(problem: LiveUrlProblem): string {
  const text = messages.dataSource.urlProblems;
  switch (problem) {
    case 'empty':
      return text.empty;
    case 'too_long':
      return text.tooLong;
    case 'unsupported_scheme':
      return text.scheme;
    case 'credentials_in_url':
      return text.credentials;
    default:
      return text.invalid;
  }
}

/**
 * The header's mode switch: a button naming the active data source, opening a small dialog with a
 * Live Mode switch and the server URL. A bad URL is shown inline on the field (linked with
 * `aria-describedby`, focus moved to it) and changes nothing; it is never thrown.
 */
export function DataSourceControl() {
  const { session, preferences, apply } = useAppSession();
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(preferences.mode === 'live');
  const [url, setUrl] = useState(preferences.liveUrl);
  const [problem, setProblem] = useState<LiveUrlProblem | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  const reset = (next: boolean) => {
    setOpen(next);
    if (next) {
      setLive(preferences.mode === 'live');
      setUrl(preferences.liveUrl);
      setProblem(null);
    }
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = apply({ mode: live ? 'live' : 'demo', liveUrl: url });
    if (result.ok) {
      setOpen(false);
      return;
    }
    setProblem(result.problem);
    urlRef.current?.focus();
  };

  const modeName = session.mode === 'live' ? messages.dataSource.live : messages.dataSource.demo;

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={messages.dataSource.trigger(modeName)}>
          <Radio aria-hidden="true" />
          {modeName}
        </Button>
      </DialogTrigger>
      <DialogContent size="sm" closeLabel={messages.common.close}>
        <DialogHeader>
          <DialogTitle>{messages.dataSource.title}</DialogTitle>
          <DialogDescription>{messages.dataSource.description}</DialogDescription>
        </DialogHeader>
        <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
          <Switch
            label={messages.dataSource.liveSwitch}
            description={messages.dataSource.liveSwitchDescription}
            checked={live}
            onCheckedChange={(checked) => {
              setLive(checked);
              setProblem(null);
            }}
          />
          <Input
            ref={urlRef}
            label={messages.dataSource.urlLabel}
            hint={messages.dataSource.urlHint(PREFERENCES.DEFAULT_LIVE_URL)}
            {...(problem ? { error: problemMessage(problem) } : {})}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={PREFERENCES.MAX_URL_LENGTH}
            disabled={!live}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setProblem(null);
            }}
          />
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{messages.common.cancel}</Button>
          </DialogClose>
          <Button type="submit" form={formId}>
            {messages.dataSource.apply}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
