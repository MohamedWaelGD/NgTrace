import { HttpClient } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { Product, ProductService } from './api.service';

/** One instance per product: each ngOnInit request belongs to that exact instance. */
@Component({
  selector: 'app-product-card',
  template: `<div class="card">{{ product().name }} — stock {{ stock() ?? '…' }}</div>`,
})
export class ProductCardComponent implements OnInit {
  readonly product = input.required<Product>();
  readonly stock = signal<number | null>(null);
  private readonly products = inject(ProductService);

  ngOnInit() {
    this.products.stock(this.product().id).subscribe((s) => this.stock.set(s.stock));
  }
}

/** Sync lifecycle request (ngOnInit → service → HttpClient). */
@Component({
  selector: 'app-product-list',
  imports: [ProductCardComponent],
  template: `
    <h2>Products</h2>
    @for (p of products(); track p.id) {
      <app-product-card [product]="p" />
    }
  `,
})
export class ProductListComponent implements OnInit {
  readonly products = signal<Product[]>([]);
  private readonly service = inject(ProductService);

  ngOnInit() {
    this.service.getAll().subscribe((list) => this.products.set(list));
  }
}

/** Async gap: input event → Subject → debounceTime → switchMap → HttpClient. */
@Component({
  selector: 'app-search',
  template: `
    <input id="search" placeholder="Search products" (input)="onInput($event)" />
    <ul>
      @for (r of results(); track r.id) {
        <li>{{ r.name }}</li>
      }
    </ul>
  `,
})
export class SearchComponent {
  readonly terms = new Subject<string>();
  readonly results = signal<Product[]>([]);

  constructor() {
    const service = inject(ProductService);
    this.terms
      .pipe(debounceTime(300), distinctUntilChanged(), switchMap((t) => service.search(t)))
      .subscribe((r) => this.results.set(r));
  }

  onInput(event: Event) {
    this.terms.next((event.target as HTMLInputElement).value);
  }
}

/** Raw fetch() from a click listener, with a JSON body and an Authorization header. */
@Component({
  selector: 'app-cart',
  template: `<button id="add-to-cart" (click)="add()">Add to cart</button> <span>{{ status() }}</span>`,
})
export class CartComponent {
  readonly status = signal('');

  async add() {
    const res = await fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer demo-secret-token' },
      body: JSON.stringify({ productId: 2, qty: 1 }),
    });
    this.status.set(`${res.status}`);
  }
}

/** Raw XMLHttpRequest from setTimeout in ngOnInit, plus failing endpoints. */
@Component({
  selector: 'app-legacy-widget',
  template: `<button id="load-broken" (click)="broken()">Load broken endpoints</button>`,
})
export class LegacyWidgetComponent implements OnInit {
  private readonly http = inject(HttpClient);

  ngOnInit() {
    setTimeout(() => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/legacy?format=xml');
      xhr.send();
    }, 200);
  }

  broken() {
    this.http.get('/api/missing').subscribe({ error: () => {} });
    this.http.get('/api/error').subscribe({ error: () => {} });
  }
}

@Component({
  selector: 'app-shop',
  imports: [ProductListComponent, SearchComponent, CartComponent, LegacyWidgetComponent],
  template: `
    <app-search />
    <app-product-list />
    <app-cart />
    <app-legacy-widget />
  `,
})
export class ShopComponent {}
