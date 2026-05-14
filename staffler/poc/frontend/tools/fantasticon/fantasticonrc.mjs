import { generateFonts, FontAssetType, OtherAssetType } from 'fantasticon';

generateFonts({
  name: 'dps-icons',
  inputDir: 'tools/fantasticon/icons',
  outputDir: 'src/assets/fonts',
  fontTypes: [FontAssetType.WOFF2],
  assetTypes: [OtherAssetType.CSS, OtherAssetType.HTML],
  prefix: 'dps-icon',
  selector: '.dps-icon',
}).then(() => console.log('DPS icons font is generated.'));
