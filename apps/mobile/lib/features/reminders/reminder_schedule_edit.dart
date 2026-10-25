/// Interval reminders are anchored to their first start date. Editing a
/// reminder must not re-anchor it to today, otherwise "every 3 days" silently
/// becomes a different schedule. A brand-new interval reminder starts today.
String intervalStartDate({String? existingStartDate, required String today}) {
  final value = existingStartDate?.trim();
  return value == null || value.isEmpty ? today : value;
}
