# Journal photo quota and crop

## Quota

- Calendar-month quota per profile (UTC month).
- Default 60 photos/month; sandbox plans: 小草 120, 苔石 240, 森語 500.
- New photos are counted on journal create/update; deleting photos does not
  restore used quota.
- Server returns `PHOTO_QUOTA_EXCEEDED`; iOS shows used/limit and checks before
  opening the picker.
- RPC `journal_photo_quota()` returns used/limit/month for the signed-in profile.

## Crop

- iOS uses the native `image_cropper` flow for newly selected photos before
  upload.
- Existing uploaded photos are not re-cropped yet (would require replacing the
  Storage object).
- Limit remains 5 photos per entry; crop does not bypass quota.

## Verification

- SQL schema assertions.
- Cloud smoke: fill quota then reject the next photo command.
- Flutter analyze/tests and iOS Profile build.
