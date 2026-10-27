/** Rect in the capture's CSS px (captures are 1440×810 at 2× device pixels). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Feature {
  image: string;
  kicker: string;
  /** Words wrapped in *stars* get the brand gradient. */
  title: string;
  sub: string;
  /** Where the camera zooms in to. */
  zoom: Rect;
}

export const CAPTURE = { width: 1440, height: 810 };

export const FEATURES: Feature[] = [
  {
    image: 'components.png',
    kicker: 'Component attribution',
    title: 'Every API call, traced to *its component*.',
    sub: 'The live component tree, with the requests each instance caused and why.',
    zoom: { x: 0, y: 55, w: 1100, h: 250 },
  },
  {
    image: 'signals.png',
    kicker: 'Signals & resources',
    title: 'Signals, resources and *value history*.',
    sub: 'See what every signal depends on, and scrub back in time.',
    zoom: { x: 0, y: 55, w: 640, h: 470 },
  },
  {
    image: 'errors.png',
    kicker: 'Errors & retries',
    title: 'Failures, retries and *recoveries*.',
    sub: 'Retry chains linked attempt by attempt.',
    zoom: { x: 245, y: 55, w: 1195, h: 220 },
  },
  {
    image: 'interceptors.png',
    kicker: 'Interceptor chain',
    title: 'Step through your *interceptors*.',
    sub: 'What each one changed, short-circuited or retried.',
    zoom: { x: 245, y: 55, w: 760, h: 215 },
  },
  {
    image: 'tokens.png',
    kicker: 'JWT inspector',
    title: 'Decode tokens with a *live expiry*.',
    sub: 'Found in headers, cookies, query strings and bodies.',
    zoom: { x: 745, y: 105, w: 640, h: 210 },
  },
  {
    image: 'contract.png',
    kicker: 'Contract & drift',
    title: 'Infer response shapes. *Flag drift.*',
    sub: "Copy any endpoint's contract as TypeScript.",
    zoom: { x: 745, y: 108, w: 520, h: 380 },
  },
  {
    image: 'replay.png',
    kicker: 'Replay',
    title: '*Edit & resend* any request.',
    sub: 'Change headers, query or body, then diff the response.',
    zoom: { x: 745, y: 110, w: 690, h: 430 },
  },
  {
    image: 'mocks.png',
    kicker: 'Mocking',
    title: 'Mock responses, *no code changes*.',
    sub: 'Respond, delay or fail. Only while the panel is open.',
    zoom: { x: 0, y: 55, w: 1440, h: 150 },
  },
];

export const CHIPS = [
  'Component attribution',
  'Signals',
  'Timeline',
  'Retries',
  'Waste detector',
  'Interceptors',
  'JWT',
  'Contracts',
  'Replay',
  'Mocks',
  'Postman & Playwright export',
];
