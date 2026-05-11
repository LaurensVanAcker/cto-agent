# Domain: User Notification Preferences

## Wat is dit

Per Company User per Company kan men configureren welke notificaties men wenst (email, in-app), en op welk schedule. Bv "wekelijkse actuals overdue mail elke maandag 09:00" aan/uit.

Confluence: 2662039570 (Internal mails for admins to perform checks), 2662039558 (Internal and external mails), 3562110977 (Reminder emails for actuals confirmation).

## Endpoints

```http
POST /api/users/{userId}/companies/{companyId}/notificationPreferences   <UserNotificationPreferencesWebDto>
GET  /api/users/{userId}/companies/{companyId}/notificationPreferences
PUT  /api/users/{userId}/companies/{companyId}/notificationPreferences   <UserNotificationPreferencesWebDto>

GET  /api/users/{userId}/companies/{companyId}/notificationPreferences/{prefId}/schedule
PUT  /api/users/{userId}/companies/{companyId}/notificationPreferences/{prefId}/schedule   <List<NotificationScheduleWebDto>>
```

Permissions: `COMPANY_USER_VIEW_NOTIFICATION_PREFERENCES`, `COMPANY_USER_EDIT_NOTIFICATION_PREFERENCES`.

## Audit

```http
GET /api/admin/audit/notifications/preferences/{id}/history
GET /api/admin/audit/notifications/schedules/{id}/history
```

Returnen `List<HistoryEntityWrapperDto<...>>` met Hibernate Envers revisions van notification config-veranderingen. Geen expliciete role-check op de URL (alleen gevoeligheid via `/api/admin/...` namespace).

## DTO shapes

Bron: `sources/dps-service-dtos.md` § 12.

`UserNotificationPreferencesWebDto`:
```
id (UUID)
userId, companyId (UUID)
contractsUpdates (Boolean)
actualsConfirmation (Boolean)
actualsOverdue (Boolean)
employeeInvitationStatus (Boolean)
companyHoursReport (Boolean)
... (per notification-type een boolean)
```

`NotificationScheduleWebDto`:
```
id (UUID)
notificationType (NotificationType: ACTUALS_OVERDUE_REMINDER | WEEKLY_REPORT | ...)
dayOfWeek (DayOfWeek)
time (LocalTime "HH:mm")
enabled (Boolean)
```

## Cron interactie

`NotificationServiceSchedule` (every 15 min) draait `POST /internalapi/notifications/sendNotification` en `sendMandatoryNotification`. Die respecteren de gebruikers-instellingen voor scheduled notifications (niet voor mandatory).

Voor PoC: niet kritiek tenzij de PoC zelf email-flows wil aansturen. Best laten staan.
