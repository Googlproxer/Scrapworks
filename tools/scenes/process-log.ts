import type { ChildProcess } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { filter, firstValueFrom, fromEvent, map, merge, timeout, type BehaviorSubject } from 'rxjs';

/** Match complete accumulated output, including control sequences split across chunks. */
export async function waitForProcessLog(
  child: ChildProcess,
  logs: BehaviorSubject<string>,
  expected: string,
): Promise<void> {
  await firstValueFrom(
    merge(
      logs.pipe(
        map(stripVTControlCharacters),
        filter((log) => log.includes(expected)),
      ),
      fromEvent(child, 'exit').pipe(
        map(() => {
          throw new Error('Dev server exited: ' + logs.value.slice(-2000));
        }),
      ),
    ).pipe(timeout({ first: 90000 })),
  );
}
