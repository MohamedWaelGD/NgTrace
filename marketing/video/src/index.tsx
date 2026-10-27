import { Composition, registerRoot } from 'remotion';
import { DURATION, FPS, Trailer } from './Trailer';

const Root = () => (
  <Composition id="Trailer" component={Trailer} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
);

registerRoot(Root);
