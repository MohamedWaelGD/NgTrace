import { Routes } from '@angular/router';
import { ProductDetailComponent } from './product-detail.component';
import { ShopComponent } from './shop.component';

export const routes: Routes = [
  { path: '', component: ShopComponent },
  { path: 'products/:id', component: ProductDetailComponent },
];
