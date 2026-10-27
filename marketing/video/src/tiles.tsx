// Chrome Web Store promo tiles, laid out at their native sizes (440×280 and 1400×560). Their last frame is the still.
import { AbsoluteFill } from 'remotion';
import { Arrow, Backdrop, Callout, Circle, Cut, Ink, LogoTile, SANS, useEnter } from './kit';

export const TILE_FRAMES = 90;

/** Shown at thumbnail size in search results: logo, name and one line, nothing else. */
export function SmallTile() {
  const logo = useEnter(2, 14);
  const text = useEnter(10);
  return (
    <AbsoluteFill style={{ fontFamily: SANS, color: '#fff' }}>
      <Backdrop blob="center" />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LogoTile size={86} style={{ transform: `scale(${logo})` }} />
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-0.035em', opacity: text }}>NgTrace</div>
        </div>
        <div style={{ marginTop: 18, fontSize: 21, fontWeight: 500, textAlign: 'center', lineHeight: 1.25, opacity: text }}>
          See which <b style={{ fontWeight: 800 }}>component</b> made
          <br />
          every API request
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function MarqueeTile() {
  const left = useEnter(4);
  return (
    <AbsoluteFill style={{ fontFamily: SANS, color: '#fff' }}>
      <Backdrop blob="right" />
      <div style={{ position: 'absolute', left: 90, top: 0, bottom: 0, width: 560, display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: left }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <LogoTile size={92} />
          <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: '-0.035em' }}>NgTrace</div>
        </div>
        <div style={{ marginTop: 30, fontSize: 42, fontWeight: 500, lineHeight: 1.15, letterSpacing: '-0.015em' }}>
          See which <b style={{ fontWeight: 800 }}>component</b> made <b style={{ fontWeight: 800 }}>every API request</b>
        </div>
        <div style={{ marginTop: 16, fontSize: 21, fontWeight: 500, opacity: 0.88 }}>A DevTools panel for Angular. Free and open source.</div>
      </div>
      <Cut crop={{ src: 'components.png', x: 0, y: 55, w: 242, h: 240 }} left={740} top={70} scale={1.2} delay={8} from="right" tilt={-1.5} />
      <Cut crop={{ src: 'components.png', x: 740, y: 108, w: 440, h: 150 }} left={880} top={340} scale={1.05} delay={20} from="right" />
      <Ink>
        <Arrow d="M 975 229 C 1090 222, 1160 280, 1135 332" delay={30} />
        <Circle cx={1068} cy={485} rx={186} ry={18} delay={40} />
      </Ink>
      <Callout text={'Pick a\ncomponent'} left={1095} top={86} tilt={4} tail="left" tailAt={0.6} delay={36} />
    </AbsoluteFill>
  );
}
