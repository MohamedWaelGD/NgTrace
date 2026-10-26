import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { tap } from 'rxjs';

export interface Product {
  id: number;
  name: string;
  price: number;
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);

  getAll() {
    return this.http.get<Product[]>('/api/products', { params: { page: 1 }, headers: { 'X-Client': 'demo' } });
  }

  get(id: number | string) {
    return this.http.get<Product>(`/api/products/${id}`);
  }

  search(term: string) {
    return this.http.get<Product[]>('/api/search', { params: { q: term } });
  }

  stock(id: number) {
    return this.http.get<{ id: number; stock: number }>(`/api/stock/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);
  config: unknown = null;

  /** Runs from provideAppInitializer: no component involved, so the request is Unattributed. */
  load() {
    return this.http.get('/api/config');
  }
}

/** Provided on the `stores/:id` route; loaded by the resolver, read by StoreDetailComponent. */
@Injectable()
export class ProductStore {
  private readonly http = inject(HttpClient);
  readonly product = signal<Product | null>(null);
  readonly loadedAt = signal<string | null>(null);

  load(id: string) {
    return this.http.get<Product>(`/api/products/${id}`).pipe(
      tap((p) => {
        this.product.set(p);
        this.loadedAt.set(new Date().toISOString());
      }),
    );
  }
}

/** Root service that polls on its own: its request has no Owner Component, only an Owner Service. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  readonly count = signal(0);

  constructor() {
    setTimeout(() => this.poll(), 100);
  }

  poll() {
    this.http.get<{ count: number }>('/api/notifications').subscribe((n) => this.count.set(n.count));
  }
}
