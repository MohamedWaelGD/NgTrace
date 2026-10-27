// The five Chrome Web Store screenshots. Each animates in; its last frame is the still.
// Crop rects are in the capture's 1440×810 CSS px; stage positions in the 1280×800 stage.
import type { FC } from 'react';
import { Arrow, Backdrop, Callout, Circle, Cut, Headline, Ink, Stage } from './kit';

export interface Shot {
  id: string;
  frames: number;
  blob: 'left' | 'right' | 'center';
  Body: FC;
}

const Components: FC = () => (
  <>
    <Headline text={'See **which component** made\n**every API request**'} />
    <Cut crop={{ src: 'components.png', x: 0, y: 55, w: 242, h: 240 }} left={70} top={236} scale={1.45} delay={8} from="left" />
    <Cut crop={{ src: 'components.png', x: 246, y: 108, w: 489, h: 97 }} left={560} top={220} scale={1.2} delay={22} from="right" />
    <Cut crop={{ src: 'components.png', x: 740, y: 108, w: 440, h: 150 }} left={600} top={452} scale={1.25} delay={42} />
    <Ink>
      <Arrow d="M 350 432 C 420 430, 430 300, 548 268" delay={34} />
      <Arrow d="M 1080 352 C 1150 380, 1150 430, 1090 470" delay={54} />
      <Circle cx={818} cy={624} rx={232} ry={24} delay={66} />
    </Ink>
    <Callout text={'Pick a\ncomponent'} left={96} top={608} tilt={-3} tail="top" tailAt={0.7} delay={30} />
    <Callout text="Its requests" left={930} top={146} tilt={3} tail="bottom" tailAt={0.3} delay={48} />
    <Callout text={'…and the exact\ncall chain'} left={940} top={684} tilt={-2} tail="top" tailAt={0.25} delay={76} />
  </>
);

const Errors: FC = () => (
  <>
    <Headline text={'Catch **failures**, **retries**\nand **recoveries**'} />
    <Cut crop={{ src: 'errors.png', x: 246, y: 135, w: 489, h: 135 }} left={80} top={222} scale={1.3} delay={8} from="left" />
    <Cut crop={{ src: 'errors.png', x: 740, y: 196, w: 520, h: 74 }} left={520} top={520} scale={1.3} delay={28} from="right" />
    <Cut crop={{ src: 'errors.png', x: 0, y: 82, w: 242, h: 125 }} left={950} top={190} scale={1.2} delay={44} from="pop" tilt={2} />
    <Ink>
      <Circle cx={180} cy={359} rx={104} ry={18} delay={20} />
      <Arrow d="M 250 382 C 290 500, 370 600, 508 604" delay={36} />
      <Circle cx={972} cy={604} rx={176} ry={15} delay={52} />
      <Circle cx={1180} cy={312} rx={40} ry={15} delay={64} />
    </Ink>
    <Callout text={'Retries linked\nattempt by attempt'} left={90} top={640} tilt={-3} tail="top" tailAt={0.8} delay={50} />
    <Callout text={'Failures per\ncomponent'} left={1010} top={370} tilt={3} tail="top" tailAt={0.6} delay={70} />
  </>
);

const Interceptors: FC = () => (
  <>
    <Headline text={'See what **every interceptor** did\nand **decode your tokens**'} />
    <Cut crop={{ src: 'interceptors.png', x: 745, y: 115, w: 260, h: 152 }} left={90} top={226} scale={1.65} delay={8} reveal={30} />
    <Cut crop={{ src: 'tokens.png', x: 745, y: 112, w: 480, h: 197 }} left={640} top={398} scale={1.15} delay={34} from="right" />
    <Ink>
      <Circle cx={262} cy={336} rx={152} ry={17} delay={44} />
      <Circle cx={934} cy={437} rx={68} ry={15} delay={60} />
    </Ink>
    <Callout text={'Secrets stay\nmasked'} left={500} top={250} tilt={3} tail="left" tailAt={0.6} delay={52} />
    <Callout text={'What each one\nchanged'} left={110} top={540} tilt={-3} tail="top" tailAt={0.3} delay={40} />
    <Callout text="Live expiry" left={850} top={334} tilt={4} tail="bottom" tailAt={0.4} delay={68} />
  </>
);

const MocksReplay: FC = () => (
  <>
    <Headline text={'**Mock** and **replay** requests\nwithout touching your code'} />
    <Cut crop={{ src: 'mocks.png', x: 0, y: 60, w: 952, h: 135 }} left={92} top={196} scale={1.15} delay={8} />
    <Cut crop={{ src: 'replay.png', x: 745, y: 115, w: 690, h: 222 }} left={520} top={450} scale={1} delay={30} from="right" />
    <Ink>
      <Circle cx={186} cy={344} rx={100} ry={17} delay={24} />
      <Circle cx={623} cy={464} rx={56} ry={16} delay={50} />
    </Ink>
    <Callout text={'Respond, delay\nor fail'} left={140} top={410} tilt={-3} tail="top" tailAt={0.3} delay={36} />
    <Callout text={'Edit & resend,\nthen diff'} left={200} top={590} tilt={2} tail="right" tailAt={0.5} delay={60} />
  </>
);

const SignalsContract: FC = () => (
  <>
    <Headline text={'**Signals**, resources and\n**API contracts**, inspected'} />
    <Cut crop={{ src: 'signals.png', x: 0, y: 82, w: 242, h: 142 }} left={80} top={220} scale={1.4} delay={8} from="left" />
    <Cut crop={{ src: 'signals.png', x: 0, y: 578, w: 242, h: 198 }} left={150} top={460} scale={1.3} delay={24} from="left" tilt={-1.5} />
    <Cut crop={{ src: 'contract.png', x: 745, y: 112, w: 360, h: 372 }} left={760} top={196} scale={1.15} delay={40} from="right" />
    <Ink>
      <Circle cx={786} cy={423} rx={38} ry={16} delay={60} />
    </Ink>
    <Callout text={'Resources and\ntheir requests'} left={445} top={260} tilt={3} tail="left" tailAt={0.5} delay={30} />
    <Callout text={'What each signal\ndepends on'} left={480} top={640} tilt={-3} tail="left" tailAt={0.4} delay={44} />
    <Callout text={'Drift flagged\nautomatically'} left={960} top={660} tilt={3} tail="top" tailAt={0.2} delay={72} />
  </>
);

export const SHOTS: Shot[] = [
  { id: 'components', frames: 150, blob: 'left', Body: Components },
  { id: 'errors', frames: 130, blob: 'right', Body: Errors },
  { id: 'interceptors', frames: 130, blob: 'center', Body: Interceptors },
  { id: 'mocks', frames: 130, blob: 'left', Body: MocksReplay },
  { id: 'signals', frames: 130, blob: 'right', Body: SignalsContract },
];

/** Takes an index: composition props must be JSON, so the shot itself cannot be passed. */
export function ShotScene({ index }: { index: number }) {
  const shot = SHOTS[index];
  const { Body } = shot;
  return (
    <>
      <Backdrop blob={shot.blob} />
      <Stage>
        <Body />
      </Stage>
    </>
  );
}
