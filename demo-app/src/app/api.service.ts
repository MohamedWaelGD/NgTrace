import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

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
