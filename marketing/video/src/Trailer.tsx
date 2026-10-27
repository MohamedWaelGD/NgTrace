import {
  linearTiming,
  springTiming,
  TransitionSeries,
  type TransitionPresentation,
  type TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { CAPTURE, CHIPS, FEATURES, type Feature } from './scenes';

export const FPS = 30;
const INTRO = 80;
const FEATURE = 110;
const OUTRO = 93;
/** Slide between features. */
const T = 15;
/** Fade-through into and out of the title cards: the old screen is gone before the new one shows. */
const TF = 24;
export const DURATION = INTRO + FEATURES.length * FEATURE + OUTRO - (FEATURES.length - 1) * T - 2 * TF;

const FONT = "'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif";
const PINK = '#f3a6d6';
const GRADIENT = 'linear-gradient(90deg, #ff3d7a, #e04bd0)';

export const Trailer = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: '#fff' }}>
    <Background />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={INTRO}>
        <TitleCard tagline="See which component made every API call." />
      </TransitionSeries.Sequence>
      {FEATURES.map((f, i) => [
        i === 0 ? (
          <TransitionSeries.Transition key={f.image + 't'} presentation={fadeThrough()} timing={linearTiming({ durationInFrames: TF })} />
        ) : (
          <TransitionSeries.Transition
            key={f.image + 't'}
            presentation={slide({ direction: 'from-right' })}
            timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
          />
        ),
        <TransitionSeries.Sequence key={f.image} durationInFrames={FEATURE}>
          <FeatureScene feature={f} />
        </TransitionSeries.Sequence>,
      ])}
      <TransitionSeries.Transition presentation={fadeThrough()} timing={linearTiming({ durationInFrames: TF })} />
      <TransitionSeries.Sequence durationInFrames={OUTRO}>
        {/* Starts animating once the fade-through has made it visible. */}
        <TitleCard tagline="Requests by component, in DevTools." outro delay={TF / 2} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

function FadeThrough({ children, presentationDirection, presentationProgress }: TransitionPresentationComponentProps<Record<string, never>>) {
  // The exiting scene fades out over the first half, the entering one fades in over the second.
  const opacity = presentationDirection === 'exiting' ? 1 - Math.min(1, presentationProgress * 2) : Math.max(0, presentationProgress * 2 - 1);
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

const fadeThrough = (): TransitionPresentation<Record<string, never>> => ({ component: FadeThrough, props: {} });

function Background() {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const glow = (color: string, size: number, x: number, y: number, opacity: number): CSSProperties => ({
    position: 'absolute',
    width: size,
    height: size,
    left: x,
    top: y,
    borderRadius: '50%',
    background: color,
    filter: 'blur(140px)',
    opacity,
  });
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(160deg, #1b1128 0%, #241433 60%, #2a1036 100%)', overflow: 'hidden' }}>
      <div style={glow('#d90a45', 900, -300 + Math.sin(t / 4) * 80, -420 + Math.cos(t / 5) * 60, 0.5)} />
      <div style={glow('#c21aa8', 1000, 1300 + Math.cos(t / 3.5) * 90, 250 + Math.sin(t / 6) * 70, 0.38)} />
      <AbsoluteFill
        style={{
          opacity: 0.06,
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at 50% 20%, #000 0%, transparent 70%)',
        }}
      />
    </AbsoluteFill>
  );
}

/** Renders *starred* words in the brand gradient. */
function Highlighted({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*[^*]+\*)/).map((part, i) =>
        part.startsWith('*') ? (
          <span key={i} style={{ background: GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function useEnter(delay: number, damping = 200) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
}

function Rise({ delay, distance = 24, children, style }: { delay: number; distance?: number; children: ReactNode; style?: CSSProperties }) {
  const p = useEnter(delay);
  return <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * distance}px)` }}>{children}</div>;
}

// Window that holds the capture: same aspect as the capture, fully inside the frame below the headline.
const WIN = { w: 1344, h: 800, top: 258, bar: 44 };
const VIEW_H = WIN.h - WIN.bar;
const VIEW_W = WIN.w;
// Fits the whole capture in the view; the zoom goes from here to the feature's rect.
const FIT = Math.min(VIEW_W / CAPTURE.width, VIEW_H / CAPTURE.height);

function FeatureScene({ feature }: { feature: Feature }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = useEnter(4);

  const z = feature.zoom;
  const target = Math.min((VIEW_W * 0.94) / z.w, (VIEW_H * 0.9) / z.h, 1.95); // ≤ 2: the captures are 2× device pixels
  const zoomIn = interpolate(frame, [26, 62], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.65, 0, 0.35, 1) });
  // A slow drift while holding, so the shot never freezes.
  const drift = interpolate(frame, [62, durationInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scale = interpolate(zoomIn, [0, 1], [FIT, target]) * (1 + 0.03 * drift);
  // Centre of view: the whole capture first, then the zoom rect.
  const cx = interpolate(zoomIn, [0, 1], [CAPTURE.width / 2, z.x + z.w / 2]);
  const cy = interpolate(zoomIn, [0, 1], [CAPTURE.height / 2, z.y + z.h / 2]);
  // Keep the view inside the capture: no empty space at the edges once zoomed.
  const halfW = VIEW_W / 2 / scale;
  const halfH = VIEW_H / 2 / scale;
  const clampTo = (v: number, half: number, size: number) => (half * 2 >= size ? size / 2 : Math.min(Math.max(v, half), size - half));
  const x = clampTo(cx, halfW, CAPTURE.width);
  const y = clampTo(cy, halfH, CAPTURE.height);

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: 54, left: 0, right: 0, textAlign: 'center' }}>
        <Rise delay={0} distance={16}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 24,
              fontWeight: 600,
              color: PINK,
              padding: '8px 22px 8px 12px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <Img src={staticFile('logo.png')} style={{ width: 32, height: 32 }} />
            {feature.kicker}
          </span>
        </Rise>
        <Rise delay={3}>
          <div style={{ marginTop: 18, fontSize: 70, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
            <Highlighted text={feature.title} />
          </div>
        </Rise>
        <Rise delay={7}>
          <div style={{ marginTop: 14, fontSize: 30, color: 'rgba(255,255,255,0.7)' }}>{feature.sub}</div>
        </Rise>
      </div>

      <div
        style={{
          position: 'absolute',
          left: (1920 - WIN.w) / 2,
          top: WIN.top,
          width: WIN.w,
          height: WIN.h,
          borderRadius: 18,
          overflow: 'hidden',
          background: '#202124',
          boxShadow: '0 50px 140px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.14)',
          opacity: enter,
          transform: `translateY(${(1 - enter) * 120}px)`,
        }}
      >
        <WindowBar />
        <div style={{ position: 'relative', width: VIEW_W, height: VIEW_H, overflow: 'hidden' }}>
          <Img
            src={staticFile(feature.image)}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: CAPTURE.width,
              height: CAPTURE.height,
              transformOrigin: '0 0',
              transform: `translate(${VIEW_W / 2 - x * scale}px, ${VIEW_H / 2 - y * scale}px) scale(${scale})`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function WindowBar() {
  const dot = (c: string): CSSProperties => ({ width: 15, height: 15, borderRadius: '50%', background: c });
  const tab = (on: boolean): CSSProperties => ({
    padding: '9px 18px',
    borderRadius: '8px 8px 0 0',
    color: on ? '#e8eaed' : '#9aa0a6',
    background: on ? '#202124' : 'transparent',
    boxShadow: on ? 'inset 0 3px 0 #d90a45' : 'none',
  });
  return (
    <div style={{ height: WIN.bar, display: 'flex', alignItems: 'flex-end', gap: 10, padding: '0 18px', background: '#2b2b30', borderBottom: '1px solid #3a3a40' }}>
      <div style={{ display: 'flex', gap: 9, alignSelf: 'center' }}>
        <div style={dot('#ff5f57')} />
        <div style={dot('#febc2e')} />
        <div style={dot('#28c840')} />
      </div>
      <div style={{ display: 'flex', gap: 2, marginLeft: 24, fontSize: 17 }}>
        <span style={tab(false)}>Elements</span>
        <span style={tab(false)}>Console</span>
        <span style={tab(false)}>Network</span>
        <span style={tab(true)}>Ngtrace</span>
      </div>
    </div>
  );
}

function TitleCard({ tagline, outro = false, delay = 0 }: { tagline: string; outro?: boolean; delay?: number }) {
  const logo = useEnter(delay, 14);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <Img
        src={staticFile('logo.png')}
        style={{
          width: outro ? 200 : 260,
          height: outro ? 200 : 260,
          filter: 'drop-shadow(0 30px 80px rgba(217, 10, 69, 0.55))',
          transform: `scale(${0.6 + 0.4 * logo}) rotate(${(1 - logo) * -18}deg)`,
          opacity: Math.min(1, logo * 1.5),
        }}
      />
      <Rise delay={delay + 8} distance={30}>
        <div style={{ marginTop: 30, fontSize: 140, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1 }}>Ngtrace</div>
      </Rise>
      <Rise delay={delay + 14}>
        <div style={{ marginTop: 20, fontSize: 42, color: PINK }}>{tagline}</div>
      </Rise>
      {outro && (
        <>
          <div style={{ marginTop: 46, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14, maxWidth: 1400 }}>
            {CHIPS.map((c, i) => (
              <Rise key={c} delay={delay + 16 + i * 1.5} distance={14}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 26,
                    padding: '10px 24px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.13)',
                    color: 'rgba(255,255,255,0.88)',
                  }}
                >
                  {c}
                </span>
              </Rise>
            ))}
          </div>
          <Rise delay={delay + 34}>
            <div style={{ marginTop: 44, fontSize: 28, color: 'rgba(255,255,255,0.6)' }}>Chrome DevTools extension · Angular 14+</div>
          </Rise>
        </>
      )}
    </AbsoluteFill>
  );
}
