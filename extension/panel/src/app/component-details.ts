import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import type { InjectedService, ProviderInfo, SignalNode, ValueTarget } from '@ngapi/protocol';
import { HugeiconsIconComponent } from '@hugeicons/angular';
import { ICONS, Twisty } from './icons';
import { SourceActions } from './source-actions';
import { InspectorStore, targetKey } from './inspector.store';
import { ValueTree } from './value-tree';

type Section = 'inputs' | 'state' | 'signals' | 'services' | 'injectors';

/** Selected component: @Inputs, State, injected services and the injector path (read-only). */
@Component({
  selector: 'app-component-details',
  imports: [ValueTree, HugeiconsIconComponent, Twisty, SourceActions],
  template: `
    @if (store.selectedService(); as service) {
      <div class="pane-title service-title" data-testid="service-title">
        Service: {{ service.name }}
        @if (store.liveThrottled() && !store.paused()) {
          <span class="live-note" data-testid="throttled-note">throttled</span>
        }
        <button class="icon" title="Back to the component" (click)="store.selectService(null)" aria-label="Back"><hugeicons-icon [icon]="icons.close" [size]="14" /></button>
      </div>
      <div class="section-body">
        @if (serviceTarget(); as target) {
          <app-value-tree [target]="target" [entries]="serviceEntries()" data-testid="service-state" />
        } @else {
          <div class="muted">Instance not created yet — showing its requests only.</div>
        }
      </div>
    } @else if (store.details(); as d) {
      <div class="pane-title">
        <span class="title">
          Details
          @if (store.selectedNode()?.destroyed) {
            <span class="live-note" data-testid="destroyed-note">destroyed — last known values</span>
          } @else if (store.paused()) {
            <span class="live-note">paused</span>
          } @else if (store.liveThrottled()) {
            <span class="live-note" title="Reading this component is slow, so values update about once a second" data-testid="throttled-note">throttled</span>
          }
        </span>
        <button class="icon" title="Refresh values" (click)="refresh(d.id)" data-testid="refresh-details" aria-label="Refresh values"><hugeicons-icon [icon]="icons.refresh" [size]="14" /></button>
      </div>
      <div class="scroll">
        <app-source-actions class="source" [node]="store.selectedNode()" [alwaysShowLocation]="true" />
        @if (d.inputs.length) {
          <h5 (click)="toggle('inputs')"><app-twisty [open]="open().has('inputs')" /> &#64;Inputs</h5>
          @if (open().has('inputs')) {
            <div class="section-body inputs">
              @for (i of d.inputs; track i.name) {
                <div class="input-row" [class.flash]="store.flashing().has('input ' + i.name)"><span class="key">{{ i.name }}</span>: <span>{{ i.preview }}</span></div>
              }
            </div>
          }
        }

        <h5 (click)="toggle('state')"><app-twisty [open]="open().has('state')" /> State</h5>
        @if (open().has('state')) {
          <div class="section-body" data-testid="state">
            <app-value-tree [target]="componentTarget(d.id)" [entries]="d.state" />
          </div>
        }

        <h5 (click)="toggle('signals')"><app-twisty [open]="open().has('signals')" /> Signals</h5>
        @if (open().has('signals')) {
          <div class="section-body" data-testid="signals">
            @if (d.signals; as signals) {
              @for (s of signals; track s.id) {
                <div
                  class="signal-row"
                  [class.flash]="store.flashing().has('signal ' + s.id)"
                  [class.target]="scrolledTo() === s.id"
                  [attr.data-signal-id]="s.id"
                  [attr.data-testid]="'signal-' + s.label"
                >
                  <span class="kind">{{ s.kind }}</span>
                  <span class="key">{{ s.label }}</span>
                  @if (s.preview !== undefined) {
                    @if (s.preview === null) {
                      : <span class="muted-value" title="Never read since it was created or last changed; not evaluated by the inspector">not evaluated</span>
                    } @else {
                      : <span class="value">{{ s.preview }}</span>
                    }
                  }
                  @if (s.dependsOn.length && s.kind !== 'signal') {
                    <span class="deps">
                      depends on
                      @for (dep of s.dependsOn; track dep) {
                        <button class="dep" (click)="scrollToSignal(dep)" [title]="'Show ' + labelOf(signals, dep)" data-testid="depends-on">{{ labelOf(signals, dep) }}</button>
                      }
                    </span>
                  }
                </div>
              } @empty {
                <div class="muted">No signals read by its template or effects.</div>
              }
            } @else {
              <div class="muted">Needs a development build (and Angular 20+).</div>
            }
          </div>
        }

        @if (d.diSupported) {
          <h5 (click)="toggle('services')">
            <app-twisty [open]="open().has('services')" /> Injected services
            <label class="fw" (click)="$event.stopPropagation()">
              <input type="checkbox" [checked]="store.showFramework()" (change)="store.showFramework.set(!store.showFramework())" /> framework
            </label>
          </h5>
          @if (open().has('services')) {
            <div class="section-body" data-testid="services">
              @for (s of visibleServices(); track s.name) {
                <div class="service" [class.framework]="s.framework" (click)="pick(s)" [attr.data-testid]="'service-' + s.name">
                  <span class="name">{{ s.name }}</span>
                  <span class="from">{{ s.from }}</span>
                  @if (store.serviceCounts().get(s.name); as count) {
                    <span class="badge">{{ count }}</span>
                  }
                </div>
              } @empty {
                <div class="muted">No app services injected.</div>
              }
            </div>
          }

          <h5 (click)="toggle('injectors')"><app-twisty [open]="open().has('injectors')" /> Injector path</h5>
          @if (open().has('injectors')) {
            <div class="section-body" data-testid="injector-path">
              @for (level of d.injectorPath; track $index) {
                <details [open]="$index === 0">
                  <summary [attr.data-testid]="'injector-' + level.label">{{ level.label }}</summary>
                  @for (p of visible(level.providers); track p.name) {
                    <div class="service provider" [class.framework]="p.framework" (click)="pick(p)">
                      <span class="dot" [class.created]="p.created" [title]="p.created === false ? 'Not created yet' : p.created ? 'Created' : ''"></span>
                      <span class="name">{{ p.name }}</span>
                      @if (store.serviceCounts().get(p.name); as count) {
                        <span class="badge">{{ count }}</span>
                      }
                    </div>
                  } @empty {
                    <div class="muted">No app providers.</div>
                  }
                </details>
              }
            </div>
          }
        } @else {
          <div class="muted">Injected services need a newer Angular (dependency-injection debug APIs).</div>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; height: 100%; }
    .scroll { overflow: auto; flex: 1; }
    h5 { margin: 0; padding: 3px 8px; font-size: 11px; font-weight: 600; cursor: pointer; border-top: 1px solid var(--row-border); display: flex; align-items: center; gap: 6px; }
    .fw { margin-left: auto; font-weight: normal; color: var(--muted); }
    .section-body { padding: 2px 0 4px 4px; }
    .input-row { font-family: var(--mono); padding: 1px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .key { color: var(--key); }
    .title { display: flex; align-items: baseline; gap: 8px; }
    .live-note { font-weight: normal; color: var(--muted); font-size: 11px; }
    .service { display: flex; align-items: center; gap: 6px; padding: 1px 8px; cursor: pointer; white-space: nowrap; }
    .service:hover { background: var(--hover); }
    .service .name { font-family: var(--mono); color: var(--tag); }
    .service.framework .name { color: var(--muted); }
    .service .from { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
    .badge { margin-left: auto; background: var(--badge); border-radius: 8px; padding: 0 6px; font-size: 10px; }
    .dot { width: 6px; height: 6px; border-radius: 50%; border: 1px solid var(--muted); flex: none; }
    .dot.created { background: var(--ok); border-color: var(--ok); }
    summary { padding: 1px 8px; cursor: pointer; font-family: var(--mono); }
    .provider { padding-left: 22px; }
    .muted { color: var(--muted); padding: 2px 8px; }
    .service-title { color: var(--tag); }
    .source { padding: 3px 8px; }
    .signal-row { font-family: var(--mono); padding: 1px 8px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; }
    .signal-row.target { outline: 1px solid var(--accent); }
    .kind { color: var(--muted); font-size: 10px; }
    .muted-value { color: var(--muted); font-style: italic; }
    .deps { color: var(--muted); font-family: system-ui, sans-serif; font-size: 11px; display: inline-flex; flex-wrap: wrap; gap: 3px; align-items: baseline; }
    .dep { font-family: var(--mono); font-size: 11px; padding: 0 4px; border-radius: 8px; }
  `,
})
export class ComponentDetails {
  protected readonly store = inject(InspectorStore);
  protected readonly icons = ICONS;
  protected readonly open = signal<ReadonlySet<Section>>(new Set<Section>(['inputs', 'state', 'signals', 'services']));
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Signal node a "depends on" chip just scrolled to (outlined briefly). */
  protected readonly scrolledTo = signal<string | null>(null);

  protected labelOf(signals: SignalNode[], id: string): string {
    return signals.find((s) => s.id === id)?.label ?? `#${id}`;
  }

  protected scrollToSignal(id: string): void {
    this.host.nativeElement.querySelector(`[data-signal-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
    this.scrolledTo.set(id);
    setTimeout(() => this.scrolledTo.set(null), 1200);
  }

  protected readonly visibleServices = computed(() => {
    const services = this.store.details()?.services ?? [];
    return this.store.showFramework() ? services : services.filter((s) => !s.framework);
  });

  protected readonly serviceTarget = computed<ValueTarget | null>(() => {
    const id = this.store.selectedService()?.serviceId;
    return id == null ? null : { kind: 'service', id };
  });

  protected readonly serviceEntries = computed(() => {
    const target = this.serviceTarget();
    return target ? (this.store.expansions().get(targetKey(target, [])) ?? []) : [];
  });

  protected componentTarget(id: number): ValueTarget {
    return { kind: 'component', id };
  }

  protected visible(providers: ProviderInfo[]): ProviderInfo[] {
    return this.store.showFramework() ? providers : providers.filter((p) => !p.framework);
  }

  protected toggle(section: Section): void {
    this.open.update((set) => {
      const next = new Set(set);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  protected pick(s: InjectedService | ProviderInfo): void {
    this.store.selectService({ name: s.name, serviceId: s.serviceId });
  }

  protected refresh(id: number): void {
    this.store.expansions.set(new Map());
    this.store.send({ type: 'get-details', id });
  }
}
