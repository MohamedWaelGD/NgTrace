import { Composition, registerRoot } from 'remotion';
import { Promo, PROMO_DURATION, PROMO_FPS } from './Promo';
import { SHOTS, ShotScene } from './shots';
import { MarqueeTile, SmallTile, TILE_FRAMES } from './tiles';
import { DURATION, FPS, Trailer } from './Trailer';

const Root = () => (
  <>
    <Composition id="Promo" component={Promo} durationInFrames={PROMO_DURATION} fps={PROMO_FPS} width={1920} height={1080} />
    <Composition id="Trailer" component={Trailer} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Composition id="SmallTile" component={SmallTile} durationInFrames={TILE_FRAMES} fps={30} width={440} height={280} />
    <Composition id="MarqueeTile" component={MarqueeTile} durationInFrames={TILE_FRAMES} fps={30} width={1400} height={560} />
    {SHOTS.map((shot, i) => (
      <Composition
        key={shot.id}
        id={`Shot${i + 1}`}
        component={ShotScene}
        defaultProps={{ index: i }}
        durationInFrames={shot.frames}
        fps={30}
        width={1280}
        height={800}
      />
    ))}
  </>
);

registerRoot(Root);
