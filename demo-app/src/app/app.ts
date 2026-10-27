import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NotificationService } from './api.service';

/** Reads a root service that loads its own data: no request is made by this component. */
@Component({
  selector: 'app-notification-badge',
  template: `<span class="badge">🔔 {{ notifications.count() }}</span>`,
})
export class NotificationBadgeComponent {
  readonly notifications = inject(NotificationService);
}

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
  imports: [RouterOutlet, RouterLink, BannerComponent, NotificationBadgeComponent],
  template: `
    <h1>Ngtrace demo</h1>
    <app-banner />
    <app-notification-badge />
    <nav><a routerLink="/" id="go-shop">Shop</a> · <a routerLink="/products/2" id="go-product-2">Product 2</a> ·
      <a routerLink="/stores/3" id="go-store-3">Store 3</a></nav>
    <router-outlet />
  `,
})
export class App {}
