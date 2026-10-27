// The ~35 s promo: title, hook, the five store screenshots animated, a timeline scene, a feature montage
// and an outro, joined by a different transition each time.
import {
  linearTiming,
  springTiming,
  TransitionSeries,
  type TransitionPresentation,
} from '@remotion/transitions';
import { clockWipe } from '@remotion/transitions/clock-wipe';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { Fragment, type ReactNode } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop, Callout, Cut, Headline, HIGHLIGHT, INK, LogoTile, Sfx, Stage, useEnter } from './kit';
import { SHOTS, ShotScene } from './shots';

export const PROMO_FPS = 30;
const T = 15;

function Intro() {
  const logo = useEnter(4, 12);
  const name = useEnter(14);
  const tag = useEnter(26);
  return (
    <>
      <Backdrop blob="center" />
      <Stage>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LogoTile
            size={190}
            style={{ transform: `scale(${logo}) rotate(${(1 - logo) * -25}deg)` }}
          />
          <div
            style={{
              marginTop: 22,
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: '-0.035em',
              opacity: name,
              transform: `translateY(${(1 - name) * 30}px)`,
            }}
          >
            NgTrace
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 30,
              fontWeight: 500,
              opacity: tag * 0.92,
              transform: `translateY(${(1 - tag) * 20}px)`,
            }}
          >
            The network inspector Angular deserves
          </div>
        </div>
        <Callout
          text="Free & open source"
          left={860}
          top={190}
          tilt={6}
          tail="bottom"
          tailAt={0.2}
          delay={42}
        />
        <Sfx name="pop" at={5} volume={0.79} />
        <Sfx name="tick" at={16} volume={0.53} />
      </Stage>
    </>
  );
}

function Hook() {
  const frame = useCurrentFrame();
  const first = useEnter(4);
  const second = useEnter(46);
  const dim = interpolate(frame, [40, 52], [1, 0.35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const line = (p: number, children: ReactNode) => ({
    opacity: p,
    transform: `translateY(${(1 - p) * 26}px)`,
    children,
  });
  return (
    <>
      <Backdrop blob="right" dark />
      <Stage>
        <div
          style={{
            position: 'absolute',
            left: 90,
            right: 90,
            top: 210,
            fontSize: 60,
            lineHeight: 1.15,
            fontWeight: 500,
            letterSpacing: '-0.025em',
          }}
        >
          <div style={{ ...line(first, null), opacity: first * dim }}>
            Your Network tab shows <b style={{ fontWeight: 800 }}>what</b> was requested.
          </div>
          <div {...line(second, null)} style={{ ...line(second, null), marginTop: 40 }}>
            NgTrace shows <b style={{ fontWeight: 800, color: '#ff4f8b' }}>which component</b> asked
            for it.
          </div>
        </div>
        <Callout
          text="…and why!"
          left={880}
          top={560}
          tilt={-5}
          tail="top"
          tailAt={0.3}
          delay={72}
        />
        <Sfx name="tick" at={5} volume={0.61} />
        <Sfx name="tick" at={47} volume={0.61} />
      </Stage>
    </>
  );
}

function Timeline() {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [22, 84], [301, 1181], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const shown = interpolate(frame, [18, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <>
      <Backdrop blob="right" />
      <Stage>
        <Headline text={'Every request on **one timeline**,\nnavigations marked'} />
        <Cut
          crop={{ src: 'timeline.png', x: 246, y: 95, w: 1194, h: 275 }}
          left={55}
          top={240}
          scale={0.98}
          delay={6}
        />
        <div
          style={{
            position: 'absolute',
            left: x,
            top: 290,
            width: 3,
            height: 218,
            background: HIGHLIGHT,
            opacity: shown,
            boxShadow: '0 0 12px rgba(255, 216, 77, 0.6)',
          }}
        />
        <Callout
          text={'Zoom & scrub\nthrough time'}
          left={210}
          top={575}
          tilt={-3}
          tail="top"
          tailAt={0.4}
          delay={40}
        />
        <Callout
          text={'Route change\nmarked'}
          left={1000}
          top={575}
          tilt={3}
          tail="top"
          tailAt={0.75}
          delay={80}
        />
      </Stage>
    </>
  );
}

const MORE = [
  'Waste detector',
  'Duplicate calls',
  'Copy as cURL',
  'HAR export',
  'Postman export',
  'Playwright stubs',
  'Masked headers',
  'Open in editor',
  'Value history',
  'Zoneless ready',
  'Injector paths',
  'Request diff',
];

function Montage() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      <Backdrop blob="center" />
      <Stage>
        <Headline text="And **so much more**" top={90} size={52} />
        {MORE.map((label, i) => (
          <Sfx key={label} name="tick" at={13 + i * 3} volume={0.39} />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 90,
            right: 90,
            top: 250,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 22,
          }}
        >
          {MORE.map((label, i) => {
            const p = Math.min(1, Math.max(0, (frame - 12 - i * 3) / (fps * 0.3)));
            const pop = p < 1 ? 0.6 + 0.5 * Math.sin((p * Math.PI) / 1.15) : 1;
            return (
              <div
                key={label}
                style={{
                  height: 76,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 18,
                  background: '#fff',
                  color: INK,
                  fontSize: 24,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  boxShadow: '0 16px 34px rgba(40, 0, 25, 0.3)',
                  opacity: p,
                  transform: `scale(${pop}) rotate(${(i % 3) - 1}deg)`,
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      </Stage>
    </>
  );
}

function Outro() {
  const logo = useEnter(4, 14);
  const name = useEnter(12);
  const sub = useEnter(22);
  const cta = useEnter(34, 12);
  return (
    <>
      <Backdrop blob="left" />
      <Stage>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            <LogoTile size={130} style={{ transform: `scale(${logo})` }} />
            <div
              style={{
                fontSize: 100,
                fontWeight: 800,
                letterSpacing: '-0.035em',
                opacity: name,
                transform: `translateX(${(1 - name) * -30}px)`,
              }}
            >
              NgTrace
            </div>
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 32,
              fontWeight: 500,
              opacity: sub,
              transform: `translateY(${(1 - sub) * 20}px)`,
            }}
          >
            Requests by component, right in DevTools
          </div>
          <div
            style={{
              marginTop: 44,
              padding: '18px 44px',
              borderRadius: 999,
              background: '#fff',
              color: INK,
              fontSize: 30,
              fontWeight: 800,
              boxShadow: '0 18px 40px rgba(40, 0, 25, 0.35)',
              opacity: Math.min(1, cta * 2),
              transform: `scale(${0.6 + 0.4 * cta})`,
            }}
          >
            Add to Chrome, it's free
          </div>
          <div style={{ marginTop: 26, fontSize: 22, fontWeight: 500, opacity: sub * 0.85 }}>
            github.com/MohamedWaelGD/NgTrace
          </div>
          <Sfx name="pop" at={5} volume={0.7} />
          <Sfx name="ding" at={35} volume={0.56} />
        </div>
      </Stage>
    </>
  );
}

const shot = (i: number) => ({ frames: SHOTS[i].frames, node: <ShotScene index={i} /> });

const SCENES = [
  { frames: 90, node: <Intro /> },
  { frames: 105, node: <Hook /> },
  shot(0),
  shot(1),
  shot(2),
  { frames: 115, node: <Timeline /> },
  shot(3),
  shot(4),
  { frames: 95, node: <Montage /> },
  { frames: 120, node: <Outro /> },
];

/** The transition into each scene after the first. */
// The presentations take different props; the series only needs them as one type.
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

function transitionInto(
  i: number,
  width: number,
  height: number,
): { presentation: AnyPresentation; timing: ReturnType<typeof linearTiming> } {
  const timing = springTiming({ config: { damping: 200 }, durationInFrames: T });
  switch (i) {
    case 1:
      return {
        presentation: fade() as AnyPresentation,
        timing: linearTiming({ durationInFrames: T }),
      };
    case 2:
      return { presentation: wipe({ direction: 'from-left' }) as AnyPresentation, timing };
    case 3:
      return { presentation: slide({ direction: 'from-right' }) as AnyPresentation, timing };
    case 4:
      return { presentation: slide({ direction: 'from-bottom' }) as AnyPresentation, timing };
    case 5:
      return { presentation: wipe({ direction: 'from-top-left' }) as AnyPresentation, timing };
    case 6:
      return { presentation: slide({ direction: 'from-right' }) as AnyPresentation, timing };
    case 7:
      return {
        presentation: clockWipe({ width, height }) as unknown as AnyPresentation,
        timing: linearTiming({ durationInFrames: T }),
      };
    case 8:
      return {
        presentation: fade() as AnyPresentation,
        timing: linearTiming({ durationInFrames: T }),
      };
    default:
      return { presentation: slide({ direction: 'from-bottom' }) as AnyPresentation, timing };
  }
}

export const PROMO_DURATION = SCENES.reduce((n, s) => n + s.frames, 0) - (SCENES.length - 1) * T;

/** Frame each transition starts on, for its whoosh. */
const TRANSITION_STARTS = SCENES.slice(0, -1).map(
  (_, i) => SCENES.slice(0, i + 1).reduce((n, s) => n + s.frames, 0) - (i + 1) * T,
);

export function Promo() {
  const { width, height } = useVideoConfig();
  return (
    <>
      {TRANSITION_STARTS.map((at) => (
        <Sfx key={at} name="whoosh" at={at - 2} volume={0.56} />
      ))}
      <TransitionSeries>
        {SCENES.map((s, i) => {
          const t = i > 0 ? transitionInto(i, width, height) : null;
          return (
            <Fragment key={i}>
              {t && <TransitionSeries.Transition presentation={t.presentation} timing={t.timing} />}
              <TransitionSeries.Sequence durationInFrames={s.frames}>
                {s.node}
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
    </>
  );
}
