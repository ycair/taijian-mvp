/// Returns how many additional photos can be selected before either the
/// per-entry cap (5) or the monthly server quota is reached.
int remainingPhotoSlots({
  required int draftCount,
  required int pendingCount,
  required int? quotaRemaining,
}) {
  final entryLeft = 5 - draftCount;
  final quotaLeft = (quotaRemaining ?? 60) - pendingCount;
  final slots = entryLeft < quotaLeft ? entryLeft : quotaLeft;
  return slots < 0 ? 0 : slots;
}
