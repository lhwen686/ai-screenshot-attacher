import { Composition, Folder, Still } from 'remotion';
import { Cover, type CoverProps } from './Cover';
import type { SceneProps } from './copy';
import { promoFrames, PromoVideo } from './Promo';

const VIDEOS: { id: string; props: SceneProps }[] = [
  { id: 'promo-zh-CN', props: { locale: 'zh_CN', layout: 'landscape' } },
  { id: 'promo-en', props: { locale: 'en', layout: 'landscape' } },
  { id: 'short-zh-CN', props: { locale: 'zh_CN', layout: 'portrait' } },
  { id: 'short-en', props: { locale: 'en', layout: 'portrait' } }
];

const COVERS: { id: string; width: number; height: number; props: CoverProps }[] = [
  { id: 'thumbnail-youtube-en', width: 1280, height: 720, props: { locale: 'en', variant: 'wide' } },
  { id: 'thumbnail-youtube-zh-CN', width: 1280, height: 720, props: { locale: 'zh_CN', variant: 'wide' } },
  { id: 'cover-bilibili-4x3-zh-CN', width: 1200, height: 900, props: { locale: 'zh_CN', variant: 'center' } },
  { id: 'cover-bilibili-16x9-zh-CN', width: 1920, height: 1080, props: { locale: 'zh_CN', variant: 'center' } },
  { id: 'cover-vertical-zh-CN', width: 1080, height: 1920, props: { locale: 'zh_CN', variant: 'vertical' } },
  { id: 'cover-vertical-en', width: 1080, height: 1920, props: { locale: 'en', variant: 'vertical' } }
];

export function RemotionRoot() {
  return (
    <>
      <Folder name="videos">
        {VIDEOS.map(({ id, props }) => (
          <Composition
            key={id}
            id={id}
            component={PromoVideo}
            width={props.layout === 'landscape' ? 1920 : 1080}
            height={props.layout === 'landscape' ? 1080 : 1920}
            fps={30}
            durationInFrames={promoFrames(props.layout)}
            defaultProps={props}
          />
        ))}
      </Folder>
      <Folder name="covers">
        {COVERS.map(({ id, width, height, props }) => (
          <Still key={id} id={id} component={Cover} width={width} height={height} defaultProps={props} />
        ))}
      </Folder>
    </>
  );
}
