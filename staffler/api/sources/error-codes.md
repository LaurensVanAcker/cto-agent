# DPS Service error codes

Source: `wlnob/dps-service` `src/main/resources/messages.properties` (commit `1fc6cd30`).

These keys are surfaced by the backend in the standard error envelope as `apiErrors[].code`. The backend resolves them via Spring's `MessageSource`. The frontend either uses the message key as-is for i18n lookup (preferred) or falls back to the default text. Some entries echo the key as the value (e.g. `CANNOT_UPDATE_EMPLOYEE_WAGE_PC_CODE`), which means no localized text was authored yet, so the frontend MUST always have a key-keyed fallback.

Only `messages.properties` (NL) exists; `messages_en.properties` and `messages_fr.properties` are NOT present in the repo. So EN and FR columns are empty unless the frontend supplies its own translations.

Total: 53 codes.

## Errors

| Code | Default text (NL) | EN | FR | Group |
|------|------------------|-----|-----|------|
| EMPLOYEE_INVALID_EMAIL | Dit veld mag niet leeg zijn | | | EMPLOYEE |
| EMPLOYEE_INVALID_MOBILE_PHONE_NUMBER | Ongeldig telefoonnummer. | | | EMPLOYEE |
| EMPLOYEE_EMPTY_COMMUNICATION_LANGUAGE | Dit veld mag niet leeg zijn | | | EMPLOYEE |
| EMPLOYEE_INVALID_IBAN | Het rekeningnummer is ongeldig. | | | EMPLOYEE |
| CONTRACT_LATE_NOT_PERMITTED | Startuur moet minstens 30 minuten in de toekomst zijn | | | CONTRACT |
| CONTRACT_LATE_FLEX_TIME_CHANGE_NOT_PERMITTED | Edit contract start date not permietted after contract started (sic) | | | CONTRACT |
| CANNOT_UPDATE_EMPLOYEE_WAGE_PC_CODE | (key echoed, no translation) | | | EMPLOYEE_WAGE |
| CANNOT_UPDATE_EMPLOYEE_WAGE_STATUTE | (key echoed, no translation) | | | EMPLOYEE_WAGE |
| CANNOT_UPDATE_EMPLOYEE_WAGE_POSITION | (key echoed, no translation) | | | EMPLOYEE_WAGE |
| PC_CODE_MINIMUM_HOURS_APPLIED | Voor dit paritair comite geldt een hogere minimumduur van contracturen. | | | PC_CODE |
| COEFFICIENT_TRAVEL_ALLOWANCE_IS_NOT_IN_RANGE | De coefficient verplaatsingsvergoeding is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_MEAL_VOUCHER_IS_NOT_IN_RANGE | De coefficient maaltijdcheques is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_ECO_CHEQUES_IS_NOT_IN_RANGE | De coefficient eco-cheques is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_DIMONA_COST_IS_NOT_IN_RANGE | De dimonakost is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_DIMONA_ADDON_IS_NOT_IN_RANGE | De fondsveiligheid is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_WHITE_COLLAR_IS_NOT_IN_RANGE | De coefficient bediende is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_BLUE_COLLAR_IS_NOT_IN_RANGE | De coefficient arbeider is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_WHITE_COLLAR_JOB_STUDENT_IS_NOT_IN_RANGE | De coefficient bediende student is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_BLUE_COLLAR_JOB_STUDENT_IS_NOT_IN_RANGE | De coefficient arbeider student is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_FLEXTIME_WHITE_COLLAR_IS_NOT_IN_RANGE | De coefficient flexijob bediende is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_FLEXTIME_BLUE_COLLAR_IS_NOT_IN_RANGE | De coefficient flexijob arbeider is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_WHITE_COLLAR_STUDENT_WORKER_IS_NOT_IN_RANGE | De coefficient bediende student werknemer is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_BLUE_COLLAR_STUDENT_WORKER_IS_NOT_IN_RANGE | De coefficient arbeider student werknemer is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_EXTRA_IS_NOT_IN_RANGE | De coefficient extra is te laag of te hoog. | | | COEFFICIENT |
| COEFFICIENT_SEASONAL_WORKER_IS_NOT_IN_RANGE | De coefficient seizoensarbeider is te laag of te hoog. | | | COEFFICIENT |
| EXCEL_IMPORT_VALIDATION_ERROR | Dit document heeft niet de juiste template. | | | EXCEL |
| CONTRACT_COMPANY_BLOCKED_ERROR | Contract kan niet aangemaakt worden want bedrijf is geblokkeerd. | | | CONTRACT |
| CONTRACT_CANCEL_NOT_PERMITTED | Je hebt geen rechten om deze actie uit te voeren | | | CONTRACT |
| CONTRACT_EDIT_HOURS_AFTER_NOT_PERMITTED | Je hebt geen toestemming om contracturen na contract te bewerken | | | CONTRACT |
| CONTRACT_SIMILAR_CONTRACTS_WITH_OVERLAPPING_DATES | Slechts een contract per dag toegestaan | | | CONTRACT |
| COMPANY_EDIT_IS_NOT_PERMITTED | Je hebt geen rechten om deze actie uit te voeren. | | | COMPANY |
| COMPANY_EDIT_COEFFICIENTS_NOT_PERMITED | Je hebt geen rechten om deze actie uit te voeren. | | | COMPANY |
| EDIT_EMPLOYEE_WAGE_IS_NOT_PERMITTED | Wijzigen van werknemersloon is niet toegestaan | | | EMPLOYEE_WAGE |
| CREATE_EMPLOYEE_WAGE_IS_NOT_PERMITTED | Je hebt geen rechten om deze actie uit te voeren. | | | EMPLOYEE_WAGE |
| EDIT_TRAVEL_ALLOWANCE_EMPLOYEE_WAGE_IS_NOT_PERMITTED | Wijzigen van reiskostenvergoeding van werknemersloon is niet toegestaan | | | EMPLOYEE_WAGE |
| EDIT_MEAL_VOUCHER_EMPLOYEE_WAGE_IS_NOT_PERMITTED | Wijzigen van maaltijdcheque van werknemersloon is niet toegestaan | | | EMPLOYEE_WAGE |
| EDIT_ECOVOUCHER_EMPLOYEE_WAGE_IS_NOT_PERMITTED | Wijzigen van ecovoucher van werknemersloon is niet toegestaan | | | EMPLOYEE_WAGE |
| DECREASE_HOURLY_WAGE_IS_NOT_PERMITTED | Verlagen van uurloon is niet toegestaan | | | EMPLOYEE_WAGE |
| CONTRACT_WORK_HOURS_LOGGED_TOO_EARLY | Je kan niet langer in -of uitprikken | | | CONTRACT |
| CONTRACT_WORK_HOURS_LOGGED_TOO_LATE | Log hours at max 16 hours after contract start and not more than hour before next one | | | CONTRACT |
| MULTIPLE_DAY_CONTRACTS_FOR_EXTRA_NOT_PERMITTED | Opeenvolgende dagcontracten zijn niet toegelaten voor Gelegenheidsarbeider horeca (Extra) | | | CONTRACT |
| EXCEEDS_ALLOWED_CONSECUTIVE_CONTRACTS_FOR_EXTRA | Voor Gelegenheidsarbeider horeca (Extra) kunnen er slechts twee opeenvolgende dagcontracten zijn | | | CONTRACT |
| SHORTEN_CONTRACT_IS_NOT_PERMITTED | Het inkorten van het contract is niet toegelaten. | | | CONTRACT |
| COMPANY_HAS_ENGAGEMENT_GROUPS | Deze klant heeft minstens een groep. | | | COMPANY |
| COMPANY_USER_EDIT_ITSELF_NOT_PERMITTED | Je kan geen rechten van jezelf aanpassen. | | | COMPANY_USER |
| INTERACT_WITH_USERS_FROM_OTHER_COMPANIES_NOT_PERMITTED | Je kan enkel gebruikers van je eigen bedrijf aanpassen. | | | COMPANY_USER |
| USER_DONT_HAVE_REQUIRED_PERMISSION | Je hebt geen rechten voor het uitvoeren van deze actie. | | | USER |
| NEWCOMER_ALREADY_EXISTS | Nieuwkomer met dit SSN bestaat al in de bedrijfspool. | | | NEWCOMER |
| COMPANY_USER_SHOULD_NOT_HAVE_GROUPS | Een gebruiker met alle rechten mag niet aan groepen toegewezen zijn. | | | COMPANY_USER |
| USER_ROLE_FIELD_SHOULD_NOT_BE_EMPTY | Deze gebruiker heeft geen rol toegewezen gekregen. | | | USER |
| COMPANY_EDIT_SICK_INVOICE_NOT_PERMITTED | Je hebt geen rechten om deze actie uit te voeren | | | COMPANY |
| COMPANY_HOURS_NOT_IN_RANGE | Je hebt geen rechten voor het uitvoeren van deze actie | | | COMPANY |
| CONTRACT_HOURS_NOT_IN_RANGE | Je hebt geen rechten voor het uitvoeren van deze actie | | | CONTRACT |
| COMPANY_EDIT_ACTUALS_BLOCK_NOT_PERMITTED | Je hebt geen rechten voor het uitvoeren van deze actie | | | COMPANY |
| CONTRACT_EMPLOYEE_ACTUALS_BLOCKED_NO_INTERACTIONS_ALLOWED | Deze module kan niet gebruikt worden. Er zijn nog openstaande prestaties voor deze medewerker. | | | ACTUALS |
| CONFIRMED_ACTUAL_UPDATE_AFTER_ONE_WEEK_NOT_ALLOWED | De prestaties van vorige week worden al verwerkt. Je kan deze niet langer aanpassen. | | | ACTUALS |
| CONTRACT_FLEX_STATUTE_MULTIPLE_DAYS_NOT_PERMITTED | Opeenvolgende dagcontracten zijn niet toegelaten voor Flex statuten | | | CONTRACT |
| COMPANY_SOCIAL_SECURITY_CATEGORY_NOT_PERMITTED | De categorie sociale zekerheid is ongeldig | | | COMPANY |
| USER_DONT_HAVE_PERMISSION_TO_SEE_EMPLOYEE_CONTRACTS | Je bent geen MyStaffler gebruiker. | | | USER |
| USER_DONT_HAVE_PERMISSION_TO_SEE_OTHER_EMPLOYEE_CONTRACTS | Je hebt geen toegang tot andere gebruikersgegevens van MyStaflfler. (sic) | | | USER |

## Notes

- "(sic)" marks typos already present in the resource file. Do not silently fix them when copying into the PoC; the frontend may key off the message text.
- The `_NOT_PERMITED` and `_NOT_PERMITTED` spellings co-exist (e.g. `COMPANY_EDIT_COEFFICIENTS_NOT_PERMITED`). Treat as authoritative codes.
- Spring also returns built-in validation/HTTP errors that are NOT in this file (e.g. `MethodArgumentNotValidException`, `400`, `403`, `404`, `409`). Add those at the envelope-level when writing the OpenAPI spec.
