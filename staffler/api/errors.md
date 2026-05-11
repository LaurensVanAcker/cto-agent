# Errors

## Envelope

Backend gooit alle business errors in dezelfde shape via `GlobalExceptionHandler.ApiErrorResponse` (record):

```json
{
  "apiErrors": [
    {
      "code": "EMPLOYEE_INVALID_NATIONAL_NUMBER",
      "details": "National number checksum does not match",
      "group": "EMPLOYEE"
    },
    {
      "code": "EMPLOYEE_INVALID_EMAIL",
      "details": "Email format invalid",
      "group": "EMPLOYEE"
    }
  ],
  "traceId": "65ff8ec60ec9f2be36ad2f8859801597"
}
```

Eén response kan meerdere errors bevatten (validatie-batch). `code` is de stable enum die je in de PoC kan switchen, `details` is human-readable in de gevraagde taal, `group` zegt welk domein de fout opgooide (`EMPLOYEE`, `CONTRACT`, `WAGE`, `COMPANY`, `ACTUAL`, ...).

## Status code map

| Status | Wanneer | Body |
|---|---|---|
| 400 | Business validation fail | `ApiErrorResponse` envelope |
| 401 | skey ontbreekt of ongeldig | `{"message":"Unauthorized"}` (gateway-niveau, niet de envelope) |
| 403 | Permission denied (PreAuthorize block) | Spring AccessDeniedException message, geen envelope |
| 404 | Resource niet gevonden | Mogelijk envelope, mogelijk Spring default |
| 409 | Conflict (zoals dubbele invitation actief) | `ApiErrorResponse` envelope |
| 422 | Niet algemeen gebruikt door deze backend |
| 500 | Onverwachte fout | `ApiErrorResponse` envelope met `traceId` voor support |
| 504 | Backend timeout via gateway | Gateway message |

## Speciaal geval: gateway 401

Een 401 van de gateway authorizer ziet er zo uit:

```http
HTTP/2 401
content-type: application/json
x-amzn-errortype: UnauthorizedException

{"message":"Unauthorized"}
```

Dat is dus NIET de envelope. Je moet content-type + body shape checken voor je het naar `apiErrors[]` parser stuurt.

## Bekende error codes

Niet exhaustief. Uit `messages.properties` en code:

```
ACTUAL_LOCKED
ACTUAL_NOT_FOUND
ACTUAL_OUTSIDE_CONFIRMATION_WINDOW
COMPANY_NOT_FOUND
COMPANY_BLOCKED
COMPANY_USER_ALREADY_EXISTS
CONTRACT_OVERLAP
CONTRACT_INVALID_DATES
CONTRACT_BEFORE_NOW
CONTRACT_NOT_FOUND
EMPLOYEE_INVALID_NATIONAL_NUMBER
EMPLOYEE_INVALID_EMAIL
EMPLOYEE_NOT_FOUND
EMPLOYEE_INVITATION_ALREADY_ACTIVE
EMPLOYEE_INVITATION_NOT_FOUND
WAGE_OUT_OF_RANGE
WAGE_NOT_FOUND
ITSME_INVALID_STATE
ITSME_USER_INFO_FAILED
PERMISSION_DENIED
```

Voor de volledige set, grep `messages.properties` in `dps-service`.

## Validation timing

Belangrijk: bijna geen `@Valid` of `@NotNull` op de Web DTOs. Een halfgevulde POST wordt door Jackson geaccepteerd, dan crasht het in de service-laag. Verwacht dus `apiErrors[]` met `details` zoals "X is required" ipv een Spring validation 400 met field-level paths.

Het enige gevalideerde request-DTO in de hele codebase is `InviteAppUserRequest` (`@NotBlank`, `@NotNull`, `@Email`).

## Trace IDs

`traceId` zit altijd in error responses. Format = lowercase hex 32 chars (W3C trace ID). Logs in CloudWatch zijn doorzoekbaar op die ID. Gebruik die in support tickets.

## Ergonomie tip voor PoC

Implementeer één centrale error parser:

```ts
function parseApiError(res: Response): ApiError | null {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) return null;
  return res.json().then(body => {
    if (body.apiErrors) {
      return { type: 'business', errors: body.apiErrors, traceId: body.traceId };
    }
    if (body.message) {
      return { type: 'gateway', message: body.message };
    }
    return null;
  });
}
```

Dat dekt de drie soorten responses (envelope, gateway message, niets).
