// Building blocks for the store screenshots and the promo video: every scene is laid out on a 1280×800
// stage (the Chrome Web Store screenshot size) and scaled to fit the composition.
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMarker } from '@remotion/google-fonts/PermanentMarker';
import { evolvePath, getLength, getPointAtLength, getTangentAtLength } from '@remotion/paths';
import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const SANS = loadInter('normal', {
  weights: ['500', '700', '800'],
  subsets: ['latin'],
}).fontFamily;
export const MARKER = loadMarker('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily;

export const STAGE = { width: 1280, height: 800 };
/** Captures are 1440×810 CSS px at 2× device pixels. */
const CAPTURE_WIDTH = 1440;

export const INK = '#1b0f1e';
export const HIGHLIGHT = '#ffd84d';

export type SoundName = 'whoosh' | 'card' | 'pop' | 'tick' | 'scribble' | 'ding';

/** A sound from public/sfx (made by scripts/sounds.mjs), starting `at` frames into the current sequence. */
export function Sfx({
  name,
  at = 0,
  volume = 0.4,
}: {
  name: SoundName;
  at?: number;
  volume?: number;
}) {
  return (
    <Sequence from={Math.max(0, Math.round(at))} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}

export function useEnter(delay: number, damping = 200) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
}

/** Brand background with a slow-drifting darker blob, like a sticker sheet. */
export function Backdrop({
  blob = 'left',
  dark = false,
}: {
  blob?: 'left' | 'right' | 'center';
  dark?: boolean;
}) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const { width, height } = useVideoConfig();
  const size = Math.max(width, height) * 0.95;
  const at = { left: [-0.12, 0.18], right: [0.38, 0.12], center: [0.12, 0.16] }[blob];
  return (
    <AbsoluteFill
      style={{
        background: dark ? INK : 'linear-gradient(140deg, #e3134f 0%, #cf1567 50%, #b31b8f 100%)',
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox="0 0 200 200"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          left: width * at[0] + Math.sin(t / 2.5) * 30,
          top: height * at[1] + Math.cos(t / 3) * 24,
          transform: `rotate(${t * 4}deg)`,
          opacity: dark ? 0.5 : 1,
        }}
      >
        <path
          fill={dark ? '#2c1534' : 'rgba(70, 0, 40, 0.2)'}
          d="M44.7,-58.6C57.1,-50.9,65.6,-36.3,70.4,-20.4C75.2,-4.4,76.3,13,70.1,27.1C63.9,41.2,50.5,52.1,35.7,60.3C20.9,68.6,4.8,74.3,-12.6,73.6C-30,72.9,-48.8,65.8,-60.4,52.3C-72,38.8,-76.5,18.9,-74.4,0.4C-72.3,-18.1,-63.6,-35.3,-50.6,-43.1C-37.6,-50.9,-20.3,-49.4,-3.5,-44.7C13.3,-40,32.3,-66.3,44.7,-58.6Z"
          transform="translate(100 100)"
        />
      </svg>
    </AbsoluteFill>
  );
}

/** Scales the 1280×800 stage to fit the composition, centred. */
export function Stage({ children }: { children: ReactNode }) {
  const { width, height } = useVideoConfig();
  const k = Math.min(width / STAGE.width, height / STAGE.height);
  return (
    <AbsoluteFill style={{ fontFamily: SANS, color: '#fff' }}>
      <div
        style={{
          position: 'absolute',
          width: STAGE.width,
          height: STAGE.height,
          left: (width - STAGE.width * k) / 2,
          top: (height - STAGE.height * k) / 2,
          transform: `scale(${k})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}

/** Centred headline; words in **double stars** are bold. Words rise in one after another. */
export function Headline({
  text,
  delay = 0,
  top = 44,
  size = 44,
}: {
  text: string;
  delay?: number;
  top?: number;
  size?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = text.split('\n');
  let n = 0;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 40,
        right: 40,
        textAlign: 'center',
        fontSize: size,
        lineHeight: 1.18,
        letterSpacing: '-0.015em',
      }}
    >
      {lines.map((line, li) => (
        <div key={li}>
          {line.split(/(\*\*[^*]+\*\*)/).flatMap((part, pi) => {
            const bold = part.startsWith('**');
            return (bold ? part.slice(2, -2) : part)
              .split(/(\s+)/)
              .filter(Boolean)
              .map((word, wi) => {
                if (/^\s+$/.test(word)) return <span key={`${pi}-${wi}`}>{word}</span>;
                const p = spring({ frame: frame - delay - n++ * 2, fps, config: { damping: 200 } });
                return (
                  <span
                    key={`${pi}-${wi}`}
                    style={{
                      display: 'inline-block',
                      fontWeight: bold ? 800 : 500,
                      opacity: p,
                      transform: `translateY(${(1 - p) * 18}px)`,
                    }}
                  >
                    {word}
                  </span>
                );
              });
          })}
        </div>
      ))}
    </div>
  );
}

export interface Crop {
  /** Capture file in public/raw. */
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A piece cut out of a panel capture, shown as a floating card at (left, top) on the stage.
 * `reveal` wipes the card in from the top over that many frames, for lists that build up.
 */
export function Cut({
  crop,
  left,
  top,
  scale = 1,
  delay = 0,
  from = 'up',
  tilt = 0,
  reveal,
  children,
}: {
  crop: Crop;
  left: number;
  top: number;
  scale?: number;
  delay?: number;
  from?: 'up' | 'left' | 'right' | 'pop';
  tilt?: number;
  reveal?: number;
  children?: ReactNode;
}) {
  const frame = useCurrentFrame();
  const p = useEnter(delay, from === 'pop' ? 14 : 200);
  const shift = { up: [0, 50], left: [-80, 0], right: [80, 0], pop: [0, 0] }[from];
  const shown = reveal
    ? interpolate(frame - delay, [6, 6 + reveal], [0, 100], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 100;
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: crop.w * scale,
        height: crop.h * scale,
        borderRadius: 14,
        overflow: 'hidden',
        background: '#202124',
        boxShadow: '0 28px 70px rgba(40, 0, 25, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.12)',
        opacity: Math.min(1, p * 1.5),
        transform: `translate(${(1 - p) * shift[0]}px, ${(1 - p) * shift[1]}px) scale(${from === 'pop' ? 0.85 + 0.15 * p : 1}) rotate(${tilt}deg)`,
      }}
    >
      <Img
        src={staticFile(`raw/${crop.src}`)}
        style={{
          position: 'absolute',
          width: CAPTURE_WIDTH * scale,
          left: -crop.x * scale,
          top: -crop.y * scale,
          clipPath: `inset(0 0 ${100 - shown}% 0)`,
        }}
      />
      {children}
      <Sfx name="card" at={delay} volume={0.53} />
    </div>
  );
}

/** Black marker speech bubble. `tail` puts a little pointer on one side, at `tailAt` (0–1) along it. */
export function Callout({
  text,
  left,
  top,
  delay = 0,
  tilt = -2,
  tail = 'none',
  tailAt = 0.5,
  width,
}: {
  text: string;
  left: number;
  top: number;
  delay?: number;
  tilt?: number;
  tail?: 'top' | 'bottom' | 'left' | 'right' | 'none';
  tailAt?: number;
  width?: number;
}) {
  const p = useEnter(delay, 11);
  const tailStyle: CSSProperties = {
    position: 'absolute',
    width: 22,
    height: 22,
    background: INK,
    transform: 'rotate(45deg)',
    borderRadius: 3,
    ...(tail === 'top' && { top: -8, left: `calc(${tailAt * 100}% - 11px)` }),
    ...(tail === 'bottom' && { bottom: -8, left: `calc(${tailAt * 100}% - 11px)` }),
    ...(tail === 'left' && { left: -8, top: `calc(${tailAt * 100}% - 11px)` }),
    ...(tail === 'right' && { right: -8, top: `calc(${tailAt * 100}% - 11px)` }),
  };
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        padding: '14px 24px 12px',
        borderRadius: 34,
        background: INK,
        color: '#fff',
        fontFamily: MARKER,
        fontSize: 21,
        lineHeight: 1.15,
        letterSpacing: '0.02em',
        textAlign: 'center',
        textTransform: 'uppercase',
        boxShadow: '0 14px 30px rgba(30, 0, 20, 0.35)',
        opacity: Math.min(1, p * 2),
        transform: `scale(${0.5 + 0.5 * p}) rotate(${tilt}deg)`,
      }}
    >
      {tail !== 'none' && <div style={tailStyle} />}
      <span style={{ position: 'relative', whiteSpace: 'pre-line' }}>{text}</span>
      <Sfx name="pop" at={delay + 1} volume={0.67} />
    </div>
  );
}

/** Full-stage SVG layer for strokes drawn over the cards. */
export function Ink({ children }: { children: ReactNode }) {
  return (
    <svg
      width={STAGE.width}
      height={STAGE.height}
      viewBox={`0 0 ${STAGE.width} ${STAGE.height}`}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        filter: 'drop-shadow(0 3px 6px rgba(30, 0, 20, 0.35))',
      }}
    >
      {children}
    </svg>
  );
}

/** A hand-drawn arrow that draws itself along `d`, with a head that follows the pen. Use inside <Ink>. */
export function Arrow({
  d,
  delay = 0,
  frames = 18,
  color = '#fff',
}: {
  d: string;
  delay?: number;
  frames?: number;
  color?: string;
}) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - delay, [0, frames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sound = <Sfx name="scribble" at={delay} volume={0.18} />;
  if (progress <= 0) return sound;
  const { strokeDasharray, strokeDashoffset } = evolvePath(progress, d);
  const at = getLength(d) * progress;
  const tip = getPointAtLength(d, at);
  const dir = getTangentAtLength(d, Math.max(0, at - 0.01));
  if (!tip || !dir) return sound;
  const angle = Math.atan2(dir.y, dir.x);
  const head = (side: number) => {
    const a = angle + Math.PI + side * 0.5;
    return `M ${tip.x + Math.cos(a) * 18} ${tip.y + Math.sin(a) * 18} L ${tip.x} ${tip.y}`;
  };
  return (
    <g fill="none" stroke={color} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
      <path d={`${head(1)} ${head(-1)}`} />
      {sound}
    </g>
  );
}

/** A hand-drawn loop around something, slightly more than one turn. Use inside <Ink>. */
export function Circle({
  cx,
  cy,
  rx,
  ry,
  delay = 0,
  frames = 16,
  color = HIGHLIGHT,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  delay?: number;
  frames?: number;
  color?: string;
}) {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - delay, [0, frames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const sound = <Sfx name="scribble" at={delay} volume={0.16} />;
  if (progress <= 0) return sound;
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = -2.3 + (i / 64) * Math.PI * 2.18;
    const wobble = 1 + 0.035 * Math.sin(t * 3) + (i / 64) * 0.06;
    pts.push(
      `${i ? 'L' : 'M'} ${(cx + Math.cos(t) * rx * wobble).toFixed(1)} ${(cy + Math.sin(t) * ry * wobble).toFixed(1)}`,
    );
  }
  const d = pts.join(' ');
  const { strokeDasharray, strokeDashoffset } = evolvePath(progress, d);
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={strokeDasharray}
        strokeDashoffset={strokeDashoffset}
      />
      {sound}
    </>
  );
}

/** The red logo on a white app-icon tile, so it stands out on the red background. */
export function LogoTile({ size, style }: { size: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        ...style,
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: '#fff',
        display: 'grid',
        placeItems: 'center',
        boxShadow: '0 22px 44px rgba(40, 0, 25, 0.4)',
      }}
    >
      <Img src={staticFile('logo.png')} style={{ width: size * 0.78, height: size * 0.78 }} />
    </div>
  );
}
