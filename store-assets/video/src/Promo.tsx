import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import type { ComponentType } from 'react';
import { AbsoluteFill } from 'remotion';
import { Background } from './components/Background';
import type { Layout, SceneProps } from './copy';
import { AUTO_FRAMES, AutoMode } from './scenes/AutoMode';
import { Demo, DEMO_FRAMES } from './scenes/Demo';
import { Hook, HOOK_FRAMES } from './scenes/Hook';
import { Intro, INTRO_FRAMES } from './scenes/Intro';
import { Outro, OUTRO_FRAMES } from './scenes/Outro';
import { POPUP_FRAMES, PopupScene } from './scenes/PopupScene';
import { Privacy, PRIVACY_FRAMES } from './scenes/Privacy';
import { Shortcuts, SHORTCUTS_FRAMES } from './scenes/Shortcuts';
import { fontFamily } from './theme';

const FADE = 15;

type Scene = { component: ComponentType<SceneProps>; frames: number };

// The landscape video covers every feature; the vertical one keeps the core flow, the popup, and automatic mode.
const SCENES: Record<Layout, Scene[]> = {
  landscape: [
    { component: Hook, frames: HOOK_FRAMES },
    { component: Intro, frames: INTRO_FRAMES },
    { component: Demo, frames: DEMO_FRAMES },
    { component: PopupScene, frames: POPUP_FRAMES },
    { component: Shortcuts, frames: SHORTCUTS_FRAMES },
    { component: AutoMode, frames: AUTO_FRAMES },
    { component: Privacy, frames: PRIVACY_FRAMES },
    { component: Outro, frames: OUTRO_FRAMES }
  ],
  portrait: [
    { component: Intro, frames: INTRO_FRAMES },
    { component: Demo, frames: DEMO_FRAMES },
    { component: PopupScene, frames: POPUP_FRAMES },
    { component: AutoMode, frames: AUTO_FRAMES },
    { component: Outro, frames: OUTRO_FRAMES }
  ]
};

/** Scenes overlap during each fade, so the video is shorter than the sum of its scenes. */
export function promoFrames(layout: Layout): number {
  const scenes = SCENES[layout];
  return scenes.reduce((total, scene) => total + scene.frames, 0) - FADE * (scenes.length - 1);
}

export function PromoVideo({ locale, layout }: SceneProps) {
  const children = SCENES[layout].flatMap(({ component: SceneComponent, frames }, index) => {
    const sequence = (
      <TransitionSeries.Sequence key={`scene-${index}`} durationInFrames={frames}>
        <SceneComponent locale={locale} layout={layout} />
      </TransitionSeries.Sequence>
    );
    return index === 0
      ? [sequence]
      : [
          <TransitionSeries.Transition
            key={`fade-${index}`}
            presentation={fade()}
            timing={linearTiming({ durationInFrames: FADE })}
          />,
          sequence
        ];
  });
  return (
    <AbsoluteFill lang={locale === 'zh_CN' ? 'zh-CN' : 'en'} style={{ fontFamily: fontFamily(locale) }}>
      <Background />
      <TransitionSeries>{children}</TransitionSeries>
    </AbsoluteFill>
  );
}
