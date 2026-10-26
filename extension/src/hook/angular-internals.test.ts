import { describe, expect, it } from 'vitest';
import { Observable, retry, firstValueFrom, catchError, of } from 'rxjs';
import { AngularInternals } from './angular-internals';

interface Sent {
  id: string;
  attempt?: number;
  retryOf?: string;
}

/**
 * A fake HttpClient whose `request` returns a cold observable that "sends" synchronously on
 * subscribe (like HttpXhrBackend) and fails while `failures` remain.
 */
function setup(failures: number) {
  const internals = new AngularInternals();
  const sent: Sent[] = [];
  let left = failures;
  class FakeHttpClient {
    request(): Observable<string> {
      return new Observable<string>((subscriber) => {
        const id = `p:${sent.length + 1}`;
        sent.push({ id, ...internals.claimAttempt(id) });
        if (left-- > 0) subscriber.error(new Error('503'));
        else {
          subscriber.next('ok');
          subscriber.complete();
        }
      });
    }
  }
  internals.patchHttpClient(FakeHttpClient.prototype);
  return { http: new FakeHttpClient(), sent };
}

describe('AngularInternals: Attempt Numbers', () => {
  it('numbers the attempts of retry(2) against a failing backend and links them to the first', async () => {
    const { http, sent } = setup(5);
    await firstValueFrom(http.request().pipe(retry(2), catchError(() => of('gave up'))));
    expect(sent).toEqual([
      { id: 'p:1', attempt: 1 },
      { id: 'p:2', attempt: 2, retryOf: 'p:1' },
      { id: 'p:3', attempt: 3, retryOf: 'p:1' },
    ]);
  });

  it('stops counting once an attempt succeeds', async () => {
    const { http, sent } = setup(1);
    expect(await firstValueFrom(http.request().pipe(retry(2)))).toBe('ok');
    expect(sent).toEqual([
      { id: 'p:1', attempt: 1 },
      { id: 'p:2', attempt: 2, retryOf: 'p:1' },
    ]);
  });

  it('treats two independent subscribers (e.g. two async pipes) as two first attempts', async () => {
    const { http, sent } = setup(0);
    const shared = http.request();
    await Promise.all([firstValueFrom(shared), firstValueFrom(shared)]);
    expect(sent).toEqual([
      { id: 'p:1', attempt: 1 },
      { id: 'p:2', attempt: 1 },
    ]);
  });

  it('tags only the first request recorded while an attempt is subscribed', () => {
    const internals = new AngularInternals();
    class FakeHttpClient {
      request() {
        return new Observable<string>(() => {
          internals.claimAttempt('a');
          expect(internals.claimAttempt('b')).toBeNull();
        });
      }
    }
    internals.patchHttpClient(FakeHttpClient.prototype);
    new FakeHttpClient().request().subscribe();
    expect(internals.claimAttempt('c')).toBeNull();
  });
});
