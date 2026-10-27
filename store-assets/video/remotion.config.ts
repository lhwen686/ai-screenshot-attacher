// Defaults for `npm run dev` and the Remotion CLI. render.mjs adds the output settings.
import { Config } from '@remotion/cli/config';

Config.setRspack(true);
// PNG frames keep the interface text crisp until the final H.264 encode.
Config.setVideoImageFormat('png');
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
Config.setColorSpace('bt709');
