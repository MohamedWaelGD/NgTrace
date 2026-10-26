import { Routes } from '@angular/router';
import { ProductStore } from './api.service';
import { ProductDetailComponent } from './product-detail.component';
import { ShopComponent } from './shop.component';
import { productResolver, StoreDetailComponent } from './store-detail.component';

export const routes: Routes = [
  { path: '', component: ShopComponent },
  { path: 'products/:id', component: ProductDetailComponent },
  {
    path: 'stores/:id',
    component: StoreDetailComponent,
    providers: [ProductStore],
    resolve: { product: productResolver },
  },
];
