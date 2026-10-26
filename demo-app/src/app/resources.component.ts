import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Product } from './api.service';

/** Signal-based loading: two httpResources (one with a debugName) and an rxResource, keyed by `id`. */
@Component({
  selector: 'app-resources',
  template: `
    <h2 id="resource-product">{{ label() }}: {{ product.value()?.name }}</h2>
    <p>Stock: {{ stock.value()?.stock }} · Matches: {{ matches.value()?.length }}</p>
    <button id="next-product" (click)="id.set(id() + 1)">Next product</button>
  `,
})
export class ResourcesComponent {
  private readonly http = inject(HttpClient);
  readonly id = signal(1, { debugName: 'id' });
  readonly label = computed(() => `Product #${this.id()}`, { debugName: 'label' });
  readonly product = httpResource<Product>(() => `/api/products/${this.id()}`);
  readonly stock = httpResource<{ id: number; stock: number }>(() => `/api/stock/${this.id()}`, { debugName: 'stockLevel' });
  readonly matches = rxResource({
    params: () => ({ q: String(this.id()) }),
    stream: ({ params }) => this.http.get<Product[]>('/api/search', { params }),
  });
}
