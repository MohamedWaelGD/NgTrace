import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { switchMap } from 'rxjs';
import { Product, ProductService } from './api.service';

/** Route params → switchMap → HttpClient, subscribed in ngOnInit. */
@Component({
  selector: 'app-product-detail',
  template: `<h2>{{ product()?.name }}</h2>`,
})
export class ProductDetailComponent implements OnInit {
  readonly product = signal<Product | null>(null);
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ProductService);

  ngOnInit() {
    this.route.paramMap.pipe(switchMap((p) => this.service.get(p.get('id')!))).subscribe((p) => this.product.set(p));
  }
}
