import { Routes } from '@angular/router';
import { ProductStore } from './api.service';
import { ErrorsComponent } from './errors.component';
import { ProductDetailComponent } from './product-detail.component';
import { ResourcesComponent } from './resources.component';
import { ShopComponent } from './shop.component';
import { WasteComponent } from './waste.component';
import { productResolver, StoreDetailComponent } from './store-detail.component';

export const routes: Routes = [
  { path: '', component: ShopComponent },
  { path: 'waste', component: WasteComponent },
  { path: 'errors', component: ErrorsComponent },
  { path: 'resources', component: ResourcesComponent },
  { path: 'products/:id', component: ProductDetailComponent },
  {
    path: 'stores/:id',
    component: StoreDetailComponent,
    providers: [ProductStore],
    resolve: { product: productResolver },
  },
];
