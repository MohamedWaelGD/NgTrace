import { Component, inject } from '@angular/core';
import { ActivatedRoute, ResolveFn } from '@angular/router';
import { Product, ProductStore } from './api.service';

/** Route resolver: the request runs during navigation, before StoreDetailComponent exists. */
export const productResolver: ResolveFn<Product> = (route) => inject(ProductStore).load(route.paramMap.get('id')!);

/** Reads data loaded by the route's resolver through the route-provided ProductStore. */
@Component({
  selector: 'app-store-detail',
  template: `
    <h2 id="store-product">{{ store.product()?.name }}</h2>
    <p>Resolved: {{ route.snapshot.data['product']?.price }}</p>
  `,
})
export class StoreDetailComponent {
  readonly store = inject(ProductStore);
  readonly route = inject(ActivatedRoute);
  readonly title = 'Store detail';
}
