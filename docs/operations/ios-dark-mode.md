# iOS light/dark mode

## Behaviour

- Toggle: `設定` → `外觀` → `深色模式`.
- The choice is persisted locally in SharedPreferences under
  `dark_mode_enabled` and restored before the app builds its first frame.
- The whole iOS app uses the 苔間 palette, not only Material defaults:
  background, cards, text, dividers, inputs, navigation, charts, journal,
  public journal, moderation and resident surfaces all switch together.
- The toggle is local to the device; it is not stored in the household or
  synced to other devices.

## Palette

- Light: warm cream background and white cards.
- Dark: deep green-black background, dark moss cards, warm off-white text.
- Accent colors remain botanical (moss, clay, butter, peach) and are adjusted
  for contrast in dark mode.

## Verification

- Theme unit tests cover light and dark palette brightness/surfaces.
- Flutter analyze/test.
- Profile iOS build installed and launched; Settings shows the switch.
- No Netlify deploy is involved.
