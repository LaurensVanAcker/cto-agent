# CFN infrastructure (cognito, dps-service, dps-external-auth)

Sources:
- `wlnob/dps-service` @ `1fc6cd30`
- `wlnob/dps-cognito` @ `d3f135f5`
- `wlnob/dps-external-auth` @ `24266637`

## dps-cognito

### Two separate user pools

DPS runs TWO Cognito user pools, defined in two separate static stacks:

1. **DPS pool** (`dps-cognito-static`) — for company-side users (managers, planners, admin). External signup is OFF (`AllowAdminCreateUserOnly: true`). Federated via `BoemmAD` (Azure AD OIDC) and `ItsMeRegistration` (itsme OIDC).
2. **MyDPS pool** (`mydps-cognito-static`) — for employees / MyStaffler app. Self-signup ON (`AllowAdminCreateUserOnly: false`). Plain Cognito only (no federation).

UserPool names per env (from static parameter files):

| Stack | dev | qa | prod |
|------|-----|----|----|
| dps-cognito-static (`Name`) | DPS-dev | **DPS** | **DPS** |
| mydps-cognito-static (`Name`) | MyDPS-dev | **MyDPS-qa** | **MyDPS** |

The pool IDs themselves are NOT hardcoded in CFN. The static stack outputs `${stackName}-UserPoolId` (the AWS-generated `eu-central-1_xxxxxx` ID) and downstream stacks consume it via `Fn::ImportValue` or read it from SSM (`/auth/dps/user_pool_id`, `/auth/dps/employee_pool_id`).

### Cognito custom attributes (DPS pool)

```yaml
Schema:
  - companyId
  - eid
  - employeeId
  - ext_access_token
  - memberOf
```

MyDPS pool drops `companyId` (employees are not bound to a single company at the pool level).

### App clients & callbacks

```yaml
# dps-cognito-dynamic.yaml — DpsAuthAd client
GenerateSecret: true
AccessTokenValidity: 60 minutes
IdTokenValidity: 60 minutes
RefreshTokenValidity: 30 days
AuthSessionValidity: 3 minutes
AllowedOAuthFlows: [code]
AllowedOAuthScopes: [aws.cognito.signin.user.admin, email, openid, phone, profile]
SupportedIdentityProviders: [BoemmAD, ItsMeRegistration, COGNITO]
ExplicitAuthFlows: [
  ALLOW_ADMIN_USER_PASSWORD_AUTH, ALLOW_CUSTOM_AUTH,
  ALLOW_REFRESH_TOKEN_AUTH, ALLOW_USER_PASSWORD_AUTH, ALLOW_USER_SRP_AUTH
]
PreventUserExistenceErrors: ENABLED
EnableTokenRevocation: true
```

Callback URLs and Cognito hosted-UI domains per env:

| Env | DPS callback | DPS Cognito domain prefix | DPS sign-out | MyDPS callback | MyDPS Cognito domain prefix | MyDPS sign-out |
|-----|--------------|---------------------------|--------------|----------------|------------------------------|----------------|
| qa | https://gw.qa.dps.boemm.eu/v1/signin | `dps-qa` | https://qa.dps.boemm.eu | https://gw.qa.dps.boemm.eu/v1/signin | `mydps-qa` | https://qa.my.staffler.be |
| prod | https://gw.myplanning.digitalpayrollservices.be/v1/signin | `dps-app` | https://myplanning.digitalpayrollservices.be | https://gw.myplanning.digitalpayrollservices.be/v1/signin | `mydps` | https://my.staffler.be |

Hosted-UI URLs are therefore:
- `https://dps-qa.auth.eu-central-1.amazoncognito.com`
- `https://dps-app.auth.eu-central-1.amazoncognito.com`
- `https://mydps-qa.auth.eu-central-1.amazoncognito.com`
- `https://mydps.auth.eu-central-1.amazoncognito.com`

### Itsme scope mapping (very important)

```yaml
Mappings:
  AuthScopesMap:
    dev:  openid profile email address phone eid service:BOEMM_AWS_LOGIN
    qa:   openid profile email address phone eid service:BOEMM_AWS_LOGIN
    prod: openid profile email address phone eid service:BOEMMDPSPRD_SHAREDATA
```

Note: prod uses a DIFFERENT itsme scope name (`service:BOEMMDPSPRD_SHAREDATA`) than dev/qa. PoC against QA must use the dev/qa scope.

### Lambda triggers wired into the pools

DPS pool:
- PreSignUp -> `LambdaRegister`
- PreAuthentication -> `LambdaCheckLogin`
- PostAuthentication -> `LambdaPostAuth`
- PostConfirmation -> `LambdaPostAuth`

MyDPS pool:
- PostConfirmation -> `LambdaEmployeePostConfirm` (referenced by import; not in the snippet I pulled, suspect it lives in dps-external-auth too)

## dps-external-auth

### DynamoDB skey table

```yaml
# Inline IAM only — table is created elsewhere, not in this stack
- Effect: Allow
  Action:
    - "dynamodb:GetItem"
    - "dynamodb:UpdateItem"
    - "dynamodb:DeleteItem"
  Resource: !Sub "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/dps-users"
```

The table is **`dps-users`** (single table for both QA and prod accounts; isolated by AWS account). The CFN does NOT define the table itself, so key schema is not visible here. Based on naming + lambda usage, it's a per-cognito-user record table keyed on Cognito sub.

### DpsAuthorizer Lambda env vars

```yaml
DpsAuthorizer:
  Environment:
    Variables:
      region: !Ref region
      TABLE: dps-users
      USER_POOL_ID:              '{{resolve:ssm:/lambda/dps/USERPOOLID_CFN}}'
      CLIENT_ID:                 '{{resolve:ssm:/lambda/dps/COGNITOCLIENTID_CFN}}'
      CLIENT_SECRET:             '{{resolve:ssm:/lambda/dps/COGNITOCLIENTSECRET_CFN}}'
      COGNITO_DOMAIN:            '{{resolve:ssm:/lambda/dps/COGNITODOMAIN_CFN}}'
      EMPLOYEE_USER_POOL_ID:     '{{resolve:ssm:/lambda/dps/EMPLOYEEPOOLID_CFN}}'
      EMPLOYEE_CLIENT_ID:        '{{resolve:ssm:/lambda/dps/EMPLOYEECLIENTID_CFN}}'
      EMPLOYEE_CLIENT_SECRET:    '{{resolve:ssm:/lambda/dps/EMPLOYEECLIENTSECRET_CFN}}'
      EMPLOYEE_COGNITO_DOMAIN:   '{{resolve:ssm:/lambda/dps/EMPLOYEECOGNITODOMAIN_CFN}}'
```

This is the unified authorizer that handles BOTH the DPS (company) pool and the MyDPS (employee) pool. The actual pool IDs and client IDs are sourced from SSM at deploy time. The names of the SSM parameters are stable across envs (`/lambda/dps/...`) but each AWS account holds its own values.

### userServiceURI / coreURI per env

```json
// QA
{ "userServiceURI": "http://lb.qa.eagle.boemm.eu:8088/users",
  "coreURI":        "http://lb.qa.eagle.boemm.eu:8082/core" }

// PROD
{ "userServiceURI": "http://lb.eagle.boemm.eu:8088/users",
  "coreURI":        "http://lb.eagle.boemm.eu:8082/core" }
```

Internal-only (lb.*.boemm.eu) — not callable from outside the VPC. Useful only as a reminder that the public API gateway proxies to these.

## dps-service

### ECR / port

```yaml
Image: 490618042986.dkr.ecr.eu-central-1.amazonaws.com/boemm/dps-service:${ImageTag}
ContainerPort: 8080  # service
NlbPort: 8103        # NLB
HealthCheckPath: /dps-api/actuator/health
UrlPath: /dps-service/*
```

So inside the VPC the service is reachable at `http://lb.<env>.eagle.boemm.eu:8103/dps-api/...`. Confirms the `/dps-api` prefix used by the lambda cron targets.

### dps-service ECS env vars

```yaml
Environment:
  - SPRING_PROFILES_ACTIVE: <env>
  - DB / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME=dpsservice  # SSM resolved
  - CORE_SERVER:           http://core.<discovery-domain>
  - CORE_PORT:             8080
  - USER_SERVICE_SERVER:   http://user-service.<discovery-domain>
  - USER_SERVICE_PORT:     8080
  - COMPANY_SERVICE_SERVER:http://company-service.<discovery-domain>
  - COMPANY_SERVICE_PORT:  8080
  - COMPANY_POOL_ID:           {{resolve:ssm:/auth/dps/user_pool_id}}
  - EMPLOYEE_POOL_ID:          {{resolve:ssm:/auth/dps/employee_pool_id}}
  - EMPLOYEE_POOL_CLIENT_ID:   {{resolve:ssm:/auth/dps/employee_pool_client_id}}
  - EMPLOYEE_POOL_CLIENT_SECRET:{{resolve:ssm:/auth/dps/employee_pool_client_secret}}
  - GOOGLEMAPS_API_KEY:    {{resolve:ssm:/auth/google/maps/api_key}}
  - COGNITO_CLIENT_ID:     {{resolve:ssm:/auth/dps/client_id}}
  - COGNITO_CLIENT_SECRET: {{resolve:ssm:/auth/dps/client_secret}}
  - ITSME_BASE_URI:        {{resolve:ssm:/auth/dps/idp/itsme/base_uri}}
  - ITSME_CLIENT_ID:       {{resolve:ssm:/auth/dps/idp/itsme/client_id}}
  - ITSME_CLIENT_SECRET:   {{resolve:ssm:/auth/dps/idp/itsme/client_secret}}
  - ITSME_REDIRECT_URI:    {{resolve:ssm:/auth/idp/itsme/redirect_uri}}
  - ITSME_SERVICE_NAME:    {{resolve:ssm:/auth/idp/itsme/service_name}}
  - ROOT_URI:              <env>.dps.boemm.eu (qa/dev) | myplanning.digitalpayrollservices.be (prod)
  - ORIGIN:                https://<ROOT_URI>
  - MY_STAFFLER_ORIGIN:    https://<env>.my.staffler.be (qa) | https://my.staffler.be (prod)
```

`MY_STAFFLER_ORIGIN` is the only allow-listed origin for the MyStaffler frontend. dps-service almost certainly uses `ORIGIN` and `MY_STAFFLER_ORIGIN` as the CORS allow-list (we did not pull the CORS bean in this slice; verify in `WebMvcConfigurer` later).

Domain mapping per env:

| Env | DPS company UI (`DomainName`) | MyStaffler (`MyStafflerDomainName`) |
|-----|-------------------------------|-------------------------------------|
| qa | dps.boemm.eu (so `qa.dps.boemm.eu`) | my.staffler.be (so `qa.my.staffler.be`) |
| prod | myplanning.digitalpayrollservices.be | my.staffler.be |

Note prod uses `myplanning.digitalpayrollservices.be` directly (no `prod.` prefix); the IsProd condition strips the env prefix.

### Lambda crons (rate of internal calls)

`dps-service-lambda-dynamic.yaml` defines 11 EventBridge-driven Python lambdas hitting internal endpoints over the VPC NLB. These are NOT public:

| Lambda | Cron | Internal target |
|--------|------|----------------|
| RegisteredHoursPerWeekForCompany | MON 07:00 | `/internalapi/companies/weeklyContractHoursReport` |
| RegisteredHoursPerWeekForAllCompany | MON 06:00 | `/internalapi/companies/adminWeeklyContractHoursReport` |
| EmployeeRegistrationReminder | every 10 min | `/internalapi/employees/invitations/checkEmailReminder` |
| ActualsUpdateToOverdue | TUE 00:01 | `/internalapi/actuals/updateToOverdue` |
| ActualsLockForPayment | MON 12:59 + 23:59 | `/internalapi/actuals/lockForPayment` |
| ActualsUnlockAfterPayment | TUE 20:00 | `/internalapi/actuals/unlockAfterPayment` |
| ActualsAutoConfirm | MON+TUE 03:00 | `/internalapi/actuals/autoConfirm` |
| ActualsDemoCleanup | every 11 min | `/internalapi/actuals/cancel?companyId=bde29951-...-167e` |
| CompanyActualsConfirmationEmail | MON 07:00 + 14:00 + 16:30 | `/internalapi/companies/confirmationEmail` |
| NotificationService | every 15 min | `/internalapi/notifications/sendNotification` |
| NotificationServiceMandatory | MON 09:00 | `/internalapi/notifications/sendMandatoryNotification` |

Hardcoded demo company UUID `bde29951-1b8e-4d60-b3f6-642a6a6c167e` is the demo cleanup target. Useful as test data if it still exists.

### SQS queues

Per env, dps-service owns these SQS queues:

```
<env>-dps-employee-updates(+ -DEAD)
<env>-dps-actuals-encodage-sync(+ -DEAD)
<env>-dps-actuals-notification-service
```

`DpsEmployeeSyncQueue` is subscribed to a Core SNS topic (`<CoreStackName>-EmployeeSnsArn`) — that's how Core pushes employee changes into dps-service.

### Kinesis stream

```yaml
DpsCompanyDataStream: <env>-dps-company-data-stream  # 1 shard, PROVISIONED
```

ECS task role has `kinesis:PutRecord(s)` on this stream. Probably a CDC out-stream for company changes.

### Auto-scaling

`MaxContainers: 2`, `DesiredCount: 1`, target CPU 75%. Single instance under normal load — meaning local-state caches are safe but global state must be DB-backed.

NonProd nightly down at 21:00 Brussels, up at 04:00 MON-FRI. Not enabled in prod (`CostSafe: false`).

## What this means for a PoC

1. **Canonical Cognito IDs come from SSM at deploy time, NOT git.** The CFN templates only know the names of the SSM parameters (`/auth/dps/user_pool_id`, `/lambda/dps/USERPOOLID_CFN`, `/lambda/dps/EMPLOYEEPOOLID_CFN`, etc.). To get the real `eu-central-1_xxxxx` IDs for the PoC, either:
   - Read SSM directly from the QA AWS account (parameter path `/auth/dps/user_pool_id` and `/auth/dps/employee_pool_id`).
   - Read the CloudFormation Outputs of the deployed `dps-cognito-static` and `mydps-cognito-static` stacks (Output `UserPoolId`).
   - Decode a real JWT issued by QA — the `iss` claim contains the pool ID directly.

2. **There are TWO pools to talk to**: a "company" pool (`DPS`) for planners/admins and an "employee" pool (`MyDPS`) for the MyStaffler app. The PoC needs to know which pool issued the token and pick the right `iss`/JWKS.

3. **AllowedOAuthFlows = code only.** Implicit flow is disabled. The PoC MUST do PKCE + code exchange. No `response_type=token` shortcut.

4. **Token lifetimes**: access 60 min, id 60 min, refresh 30 days, auth-session 3 min. The 3-minute auth session is short — if the user delays at the IdP, the code exchange will fail with `invalid_grant`.

5. **Hosted-UI domain prefixes** are `dps-qa` / `mydps-qa` for QA; full URLs in the table above.

6. **CORS is gated to two origins per env** (`ORIGIN`, `MY_STAFFLER_ORIGIN`). A localhost PoC will not be allowed by prod CORS without proxy or env hacks.

7. **The "auth" gateway prefix is `/v1/signin`**, served at `gw.qa.dps.boemm.eu` (qa) and `gw.myplanning.digitalpayrollservices.be` (prod). All public traffic transits this API gateway; the underlying NLB endpoints (`lb.<env>.eagle.boemm.eu:8103/dps-api/*`) are private.

8. **Skey storage is DynamoDB `dps-users`** in the same account — not visible cross-account, so PoC cannot inspect QA's table. Schema not in CFN; will need to read it via the lambda Python code or AWS console.

9. **No rate limits configured at the CFN level** — neither WAF nor API Gateway throttle settings are present in these templates. If they exist, they're in another stack (likely `boemm-api-gateway-static`, imported but not pulled).

10. **Itsme prod scope differs** (`service:BOEMMDPSPRD_SHAREDATA` vs dev/qa `service:BOEMM_AWS_LOGIN`). PoC must NOT carry the prod scope into QA testing.
