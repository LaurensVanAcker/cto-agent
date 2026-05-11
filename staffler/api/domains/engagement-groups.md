# Domain: Engagement Groups

## Wat is een Group

Een EngagementGroup = vrij-configureerbare tag binnen een Company om een subset employees te markeren (Flexi's, jobstudenten, Locatie A/B, ...). N-op-n relatie met Employee. Opt-in feature: niet elke Company gebruikt het.

In de huidige Staffler-visie van Laurens zou dit later vervangen worden door Vestiging + Functie (zie `staffler/visie/vestigingen-functies.md`), maar in de huidige API blijven dit Engagement Groups.

Confluence: 2806644740 (DPS: Group employees), 2806054922 (Grouping of employees), 2542272621 (Filter by groups).

## Endpoints

```http
POST   /api/companies/{companyId}/groups                        <EngagementGroupCreateRequestWebDto>
GET    /api/companies/{companyId}/groups/{groupId}
PUT    /api/companies/{companyId}/groups/{groupId}              <EngagementGroupWebDto>
DELETE /api/companies/{companyId}/groups/{groupId}
GET    /api/companies/{companyId}/groups?ids=&employeeNameLike=&nameLike=&page=&size=
GET    /api/companies/{companyId}/groups/employees?groupIds=&nameLike=&unassigned=&page=&size=&sortBy=
POST   /api/companies/{companyId}/employees/{employeeId}/groups   List<EngagementGroupWebDto>
```

Permissions: `COMPANY_GROUP_EDIT` voor PUT/POST, `COMPANY_GROUP_DELETE` voor DELETE.

## EngagementGroupWebDto shape

```
id (UUID)
companyId (UUID)
name (String)
description (String)
employees (List<EngagementGroupEmployeeWebDto>) -- alleen op detail-call
employeeCount (Integer) -- alleen op list-call
```

`EngagementGroupEmployeeWebDto`:
```
employeeId (UUID)
firstName, lastName (String)
addedAt (LocalDateTime)
```

`EngagementGroupCreateRequestWebDto`:
```
name (String)
description (String)
employeeIds (List<UUID>) -- initiële members
```

## Filter group employees

```http
GET /api/companies/{companyId}/groups/employees?groupIds=g1,g2&nameLike=jan&unassigned=false&page=0&size=20
```

Listing van employees die in één van de groups zitten, of als `unassigned=true` juist de employees ZONDER group. Returnt `PageWebDto<EngagementGroupEmployeeWebDto>`.

Handig voor UI: één scherm waar je een "filter by group" sidebar bouwt over de employee-lijst.

## Update employee's groups

```http
POST /api/companies/{companyId}/employees/{employeeId}/groups
Content-Type: application/json

[
  { "id": "<groupId-1>" },
  { "id": "<groupId-2>" }
]
```

Vervangt de volledige set van groups voor deze employee. Body is een lijst van `EngagementGroupWebDto`, je hoeft alleen de `id` mee te sturen.

## GROUP_USER role

Sommige Company-side users zijn `GROUP_USER`: ze zien alleen employees in een specifieke set groups. De backend filtert automatisch op alle employee-listing endpoints.
