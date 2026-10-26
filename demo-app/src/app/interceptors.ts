import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of, retry, tap } from 'rxjs';

/** Adds a bearer token to profile requests. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/profile')) return next(req);
  return next(req.clone({ setHeaders: { Authorization: 'Bearer demo-profile-token' } }));
};

const profileCache = new Map<string, HttpResponse<unknown>>();

/** Answers repeated profile GETs from memory, without calling `next`. */
export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || !req.url.startsWith('/api/profile')) return next(req);
  const cached = profileCache.get(req.urlWithParams);
  if (cached) return of(cached.clone());
  return next(req).pipe(tap((event) => event instanceof HttpResponse && profileCache.set(req.urlWithParams, event)));
};

/** Retries unstable endpoints once, inside the interceptor chain. */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  return req.url.startsWith('/api/unstable') ? next(req).pipe(retry(1)) : next(req);
};
