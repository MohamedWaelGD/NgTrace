import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

/** Makes a request from its constructor: attributed from the stack (`new BannerComponent`). */
@Component({
  selector: 'app-banner',
  template: `<p class="banner">{{ message }}</p>`,
})
export class BannerComponent {
  message = 'Welcome';

  constructor() {
    inject(HttpClient)
      .get<{ message: string }>('/api/banner')
      .subscribe((b) => (this.message = b.message));
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, BannerComponent],
  template: `
    <h1>Angular API Inspector demo</h1>
    <app-banner />
    <nav><a routerLink="/" id="go-shop">Shop</a> · <a routerLink="/products/2" id="go-product-2">Product 2</a></nav>
    <router-outlet />
  `,
})
export class App {}
