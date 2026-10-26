import { describe, expect, it } from 'vitest';
import { attribute } from './attribution';
import { OwnerContext } from './context';
import { InstanceRegistry } from './registry';
import { ResourceTracker } from './resources';

function componentClass(name: string) {
  const ctor = class {
    [key: string]: unknown;
  };
  Object.defineProperty(ctor, 'name', { value: name });
  (ctor as unknown as Record<string, unknown>)['ɵcmp'] = { debugInfo: { className: name } };
  return ctor;
}

/** Duck-types Angular's ResourceImpl: a loader the resource's effect calls synchronously. */
function fakeResource(loader: () => unknown, debugName?: string) {
  const fn = () => undefined;
  return { loaderFn: loader, effectRef: { destroy: fn }, value: fn, status: fn, debugName };
}

function setup() {
  const registry = new InstanceRegistry();
  const context = new OwnerContext(registry);
  const tracker = new ResourceTracker(context, registry);
  /** What the hook would record for a request sent right now. */
  const send = (stack = '') =>
    attribute({ stack, syncOwner: context.sync(), asyncOwner: context.asyncOwner, transport: 'xhr', registry }).attribution;
  return { registry, context, tracker, send };
}

describe('ResourceTracker', () => {
  it('tags a request sent by a wrapped loader with its Owner Resource and component', () => {
    const { tracker, send, registry } = setup();
    const Detail = componentClass('ProductDetailComponent');
    const instance = new Detail();
    let sent: ReturnType<typeof send> | null = null;
    instance['product'] = fakeResource(() => (sent = send()));
    tracker.scan(instance);
    (instance['product'] as { loaderFn: () => void }).loaderFn();
    expect(sent).toMatchObject({
      className: 'ProductDetailComponent',
      instanceId: registry.idOf(instance),
      confidence: 'context',
      via: 'resource',
      ownerResource: 'ProductDetailComponent.product',
    });
  });

  it('names the resource by its debugName when it has one', () => {
    const { tracker, send } = setup();
    const instance = new (componentClass('ProductDetailComponent'))();
    let sent: ReturnType<typeof send> | null = null;
    instance['stock'] = fakeResource(() => (sent = send()), 'stockLevel');
    tracker.scan(instance);
    (instance['stock'] as { loaderFn: () => void }).loaderFn();
    expect(sent!.ownerResource).toBe('ProductDetailComponent.stockLevel');
  });

  it('wraps each loader once, scans each instance once, and leaves other fields alone', () => {
    const { tracker, context } = setup();
    const instance = new (componentClass('ProductDetailComponent'))();
    const owners: unknown[] = [];
    instance['product'] = fakeResource(() => owners.push(context.sync()));
    instance['title'] = 'Product';
    tracker.scan(instance);
    tracker.scan(instance);
    (instance['product'] as { loaderFn: () => void }).loaderFn();
    expect(owners).toHaveLength(1);
    expect(context.sync()).toBeNull();
    expect(instance['title']).toBe('Product');
  });

  it('keeps the resource as the owner of requests sent after an await in the loader', async () => {
    const { tracker, context, send } = setup();
    const instance = new (componentClass('ProductDetailComponent'))();
    instance['product'] = fakeResource(() => Promise.resolve().then(context.bind(() => send())));
    tracker.scan(instance);
    const sent = await (instance['product'] as { loaderFn: () => Promise<ReturnType<typeof send>> }).loaderFn();
    expect(sent).toMatchObject({ via: 'async', ownerResource: 'ProductDetailComponent.product' });
  });
});

describe('resource loader Call Chain step', () => {
  it('names an unknown resource loader in the Call Chain', () => {
    const { send } = setup();
    const stack = [
      'Error',
      '    at FetchBackend.handle (http://localhost:4200/main.js:10:1)',
      '    at ProductStore.loadOne (http://localhost:4200/main.js:20:1)',
      '    at ResourceImpl.loadEffect (http://localhost:4200/main.js:30:1)',
    ].join('\n');
    const a = send(stack);
    expect(a.callChain).toEqual(['resource loader', 'ProductStore', 'HttpClient']);
    expect(a.ownerResource).toBeUndefined();
  });
});
