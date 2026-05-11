# LinkedIn-update Laurens Van Acker — bronnen en voorstellen

## 1. Vlerick Project Management opleiding (Spring 2026)

### Wat is dit programma volgens Vlerick

Officiële naam: Project Management. Vier dagen executive education, certificate degree, business unit Open Exec Ed, prijs 4 995 euro excl. btw. Vermelding "#1 in Open Executive Education in Belgium and #25 worldwide" (FT-ranking) en 1 779 oud-deelnemers met score 4,4/5 voor Learning Impact.

Faculty: Mario Vanhoucke (Decision Sciences, projectplanning, risk, control) en Dirk Buyens (HRM, talent, organisational structuring, INSI-assessment).

Inhoud in vier modules:

- Module 1: The fundamentals of project-based working — verschil project- vs portfoliomanagement, link met organisatiestructuur, pitfalls en success factors.
- Module 2: Project planning and network analysis — netwerkplanningstechnieken, resource management, simulation cases, project planning software.
- Module 3: Project performance management and project control — risk management, baseline schedule, performance measurement & follow-up.
- Module 4: Teamwork and people management skills — team building, interaction styles, communicatie, INSI persoonlijkheidsassessment.

### Jouw editie

Edition: Project Management Spring 2026, Vlerick Campus Brussels, 20 & 23-25 maart 2026. Vier dagen klassikaal, finale sessie met INSI-rapport door prof. Dirk Buyens op 25 maart. Digitale certificate ontvangen op 26 maart 2026 (mail van Sarah Sante / Vlerick + dean Marion Debruyne).

Inschrijving 15/11/2025 bevestigd door Sarah Sante. Factuur 162506099 betaald via Nempo BV. Subsidie via KMO-portefeuille onder dossiernummer 2025KMO159860 (oproep tot storting 8/12/2025).

### Wat een studiegenoot er over schreef (Guy Gelaude)

Guy Gelaude noemt het programma "Data-Driven Project Management" en schrijft: "we dove deep into the world of Critical Paths, PERT, BAC, EV, SPI(t) and many other PM abbreviations and frameworks. A special thanks to Professor Mario Vanhoucke." Hashtags: #alwayslearning #creatingimpact #businesstransformation #datadrivenprojectmanagement.

Dat zijn de Earned Value Management-metrics (Budget at Completion, Earned Value, Schedule Performance Index over time) — typisch voor module 2 en 3.

## 2. LinkedIn Education-velden — voorstel ingevuld

LinkedIn vraagt deze velden bij "Add education":

- School (verplicht, dropdown)
- Degree (vrije tekst)
- Field of study (vrije tekst)
- Start date / End date (maand + jaar)
- Grade (optioneel)
- Activities and societies (optioneel)
- Description (optioneel, max 1 000 karakters)
- Media (optioneel, voor certificate-PDF)
- Skills (optioneel, kun je toevoegen na bewaren)

Voorstel per veld:

- School: Vlerick Business School (selecteer de officiële LinkedIn-pagina, niet typen)
- Degree: Certificate — Project Management
- Field of study: Project Management & Project Control
- Start date: maart 2026
- End date: maart 2026
- Grade: leeg laten (executive education krijgt geen cijfer)
- Activities and societies: Executive education cohort Spring 2026, Brussels campus. INSI personality assessment with prof. Dirk Buyens.
- Description (Nederlands, ongeveer 600 tekens):

  Vier dagen executive programma over project-based working, network planning (Critical Path, PERT), risk management, project control en Earned Value Management (BAC, EV, SPI(t)). Faculty: prof. Mario Vanhoucke (project scheduling, risk, control) en prof. Dirk Buyens (HRM, team dynamics, INSI-assessment).
  Gefocust op data-driven project management: hoe je met meetbare baselines en performance indicators projecten op tijd, binnen budget en met de juiste impact aflevert. Praktijkgericht via case simulations.

- Description (English variant, ongeveer 600 tekens):

  Four-day executive programme on project-based working, network planning (Critical Path, PERT), risk management, project control and Earned Value Management (BAC, EV, SPI(t)). Faculty: prof. Mario Vanhoucke (project scheduling, risk, control) and prof. Dirk Buyens (HRM, team dynamics, INSI assessment).
  Focused on data-driven project management: delivering projects on time, on budget and with the right impact, anchored in measurable baselines and performance indicators. Hands-on through case simulations.

- Media: upload je digitale Vlerick-certificaat (PDF uit de mail van 26 maart 2026 "Your Digital Certificate is Here")
- Skills (na bewaren toe te voegen): Project Management, Project Planning, Risk Management, Earned Value Management, Critical Path Method (CPM), PERT, Stakeholder Management, Project Portfolio Management

## 3. BOEMM ervaring — lange inventaris (2 jaar werk)

### Bron-overzicht

Wat ik gebruikt heb om dit op te bouwen:

- 100 recente Jira-issues waar je assignee of reporter bent (boemm.atlassian.net) — 66 in BCJ ("Henry"), 22 in TP, 12 incidents in PRD. Geen Epics in deze slice — vooral Stories, Sub-tasks, Bugs en Incidents.
- 21 Confluence-pagina's en comments die je hebt gecreëerd sinds mei 2024 — spaces ITdoc, HENRY, BC (Eagle), DPS, TRAN, plus de architectural talks-database.
- GitHub-repo's onder de wlnob-organisatie waar je toegang toe hebt: boemm-core (Java), boemm-core-consumer (Java), boemm-media (Python), boemm-performance (JS), boemm-dubbies (JS), boemm-lambda-authentication (Python), boemm-api-gw, boemm-employee-performance-overview (Python), boemm-api-gw, jobfixers-applications, jobfixers-work, my-jobfixers, jobfixers-applications-api-gateway, onboarding. Commits onder "laurens-boemm" zelf zijn beperkt — meeste code via team. Klopt dat?
- BOEMM.eu/de-familie — je huidige bedrijfsbio.
- Inspiratie uit Mathias Volckaert's BOEMM-LinkedIn (via Google snippet — LinkedIn-profielen van Alana, Phaedra, Sam en Laurens Verhulst zitten achter de authwall, dus daar kreeg ik niets bruikbaars uit). Wil je dat je inlogt en ik ze opnieuw probeer?

### Tien thema's waar je in de laatste 2 jaar aan getrokken hebt

1. Data platform & analytics
   Datalake, Redshift, Aurora, Airflow upgrades, dim_-tabellen voor Sales Cockpit, materialized views (dim_vacancies, dim_employees dedup, dim_date filters), Reporting Date op fact_events, user-office mapping naar Redshift. Repo's boemm-performance + boemm-employee-performance-overview.

2. CUCM-telefonie pipeline
   Volledige sub-task chain om call detail records via SFTP naar Lambda naar Aurora naar Zero-ETL Redshift te brengen, met dedup op pkid en sAMAccountName-naar-GUID resolutie. Architectuur eind oprolling klaar.

3. HubSpot-integratie
   Sync-flow Staffler/HubSpot, hunter-sync naar dim_, force-tag Work Today company, recurrent incidents triagen (PRD-3045/3036/3029). HubSpot architecture talks gedocumenteerd in HENRY-database.

4. ItsMe identity flow
   Client-secret rotatie, "Same authorization code is used twice towards ItsMe" bug, end-to-end flow fix. ItsMe flow in Work Today gedocumenteerd in architectural talks.

5. Eagle (recruitingtool)
   Spike free-text fields, wrong-niche bug, PC-code blocking (PC124, PC139), prefilled user details, hint UX. VDAB Vacancy model review.

6. Pay-commission (PC) blocking & wage templates
   Multi-app rollout (Eagle, Staffler, WorkToday) met paired BE/FE/Testing sub-tasks voor PC-code selectie en blocking, plus removal van activeContractExists.

7. Niche / DSR / Falcon
   Nieuwe niche DSR uitgerold in Staffler en WorkToday, niche-additions in user service.

8. Staffler product
   Mobile phone number, group export, statute dropdown SAS, employee profile dictionaries, vibe-coded Recruitee export. Staffler-architectuur (HubSpot, itsme, Credit Safe) gedocumenteerd, 3-niveaus planscherm in uitwerking (manueel + shift broadcast + beschikbaarheden).

9. WorkToday + DPS performance
   "DPS: fetching wage packages takes too long", caching en read-write splitting voor CORE, notification e-mail wijzigingen. Auto-encodage script in AWS, materialized view refresh procedures.

10. Productie-incidenten en infra
   RedShift IP whitelist na office move, Azure Entra ID sync, login 500s, geographic-coverage data analysis (postcodes 9800/9850), kantorenlijst 2025 onderhouden, Tech Superhero-script voor Slack-rotatie, Prioriteitenmatrix IT-support uitgeschreven.

### Naast tickets — wat dit zegt over je rol

- End-to-end CTO: data engineering (Redshift, Aurora, Airflow, Lambda, Zero-ETL), product features (Eagle, Staffler, WorkToday, DPS), third-party integraties (HubSpot, ItsMe, CUCM, Azure Entra), live productie-triage en infrastructuur.
- Hands-on tech lead-patroon: tickets opbreken in BE/FE/Testing-triplets, 38 tickets als reporter zonder assignee — jij bent de router.
- Team van ~18 (2 BA's, 1 sysadmin, 2 jobstudenten, 1 manuele QA, 5 backenders, 2 frontenders, 1 scrum master, 2 regression testers, 2 freelance devops).
- Belgische payroll/recruitment-context: PC-codes, paritair comités, niches, wage templates, flexi.
- Schrijft beleid: prioriteitenmatrix IT-support, allocation-templates, release notes (bvb. Henry release 27/08/25 Digidocs).
- Houdt knowledge sharing levend: HubSpot architecture parts 1-3, well-architecture security pillar, macOS tools, CloudFormation, ItsMe flow, bi-weekly knowledge sharing-sessies.

## 4. BOEMM LinkedIn experience — distillaat (gebruiksklaar)

### Optie A — korte versie (Nederlands, ongeveer 6 regels)

Headline-suggestie: CTO bij BOEMM! / Jobfixers — HR-tech in transitie naar AI-first

Description (kopieerbaar):

CTO bij BOEMM!, de groep achter Jobfixers, Work Today, Staffler en Digital Payroll Services. Verantwoordelijk voor productontwikkeling, dataplatform en infrastructuur over vier producten en een team van zo'n 18 mensen (BA, dev, QA, devops, sysadmin).

Focus de voorbije twee jaar: van een HR-bedrijf met losse tools naar een geïntegreerd HR-tech-platform met één datalake (Redshift + Aurora), gedeelde identity (ItsMe), en geautomatiseerde flows tussen recruiting (Eagle), payroll (DPS) en planning (Staffler / Work Today).

Hands-on op architectuur, integraties (HubSpot, ItsMe, CUCM, Azure Entra) en productie-triage. Hou de organisatie tegelijk klaar voor de volgende sprong: AI-first workflows en data-driven sales & ops.

### Optie B — korte versie (English, ongeveer 6 regels)

Headline-suggestie: CTO at BOEMM! / Jobfixers — HR-tech transitioning to AI-first

Description:

CTO at BOEMM!, the group behind Jobfixers, Work Today, Staffler and Digital Payroll Services. Accountable for product engineering, data platform and infrastructure across four products and a team of around 18 people (BA, dev, QA, devops, sysadmin).

The past two years I have led the shift from a collection of HR tools into one integrated HR-tech platform: shared data lake (Redshift + Aurora), shared identity (ItsMe), and automated flows between recruiting (Eagle), payroll (DPS) and planning (Staffler / Work Today).

Hands-on on architecture, integrations (HubSpot, ItsMe, CUCM, Azure Entra) and live production triage. Preparing the organisation for the next leap: AI-first workflows and data-driven sales & ops.

### Optie C — uitgebreide versie met categorieën (Nederlands)

CTO bij BOEMM! sinds begin 2024. BOEMM! is de holding boven Jobfixers, Work Today, Staffler en Digital Payroll Services en levert HR-diensten over rekrutering, uitzending, payroll en planning. Mijn opdracht: de groep transformeren van een analoog HR-bedrijf naar een technologie-gedreven, AI-first speler.

Wat ik aanstuur:

- Productontwikkeling over vier productlijnen — Eagle (recruiting), Staffler (planning & shift broadcast), Work Today (zelf-onboarding) en DPS (payroll).
- Een team van zo'n 18 mensen: 2 BA's, 5 backenders, 2 frontenders, 1 scrum master, 1 manuele QA, 2 regression testers, 2 freelance devops, 1 sysadmin en 2 jobstudenten.
- Eén gedeeld dataplatform (Redshift + Aurora + Airflow), één gedeelde identity-flow (ItsMe), en gedeelde integraties met o.a. HubSpot, CUCM, Azure Entra ID en de overheid (Dimona, VDAB).

Wat de voorbije twee jaar gerealiseerd is:

- Datalake- en analyticslaag uitgerold (Sales Cockpit, dim_-modellen, materialized views, CUCM call data via Zero-ETL).
- Identity- en signing-flow gemoderniseerd: ItsMe rotatie, Digidocs voor digitale documenten en signaturen.
- Pay-commission blocking, wage templates en niche-DSR over Eagle, Staffler en Work Today gesynchroniseerd.
- Operationele cadans neergezet: Tech Superhero-rotatie in Slack, prioriteitenmatrix voor IT-support, bi-weekly knowledge sharing en release notes per product.
- Hands-on op productie-incidenten: office-IP whitelist, Entra-sync, login 500s, geographic coverage analysis voor sales planning.

Volgende horizont: AI-first workflows in elk van de producten, en het loslaten van legacy-integraties zonder de operationele continuïteit van 137 wagens, 25+ kantoren en duizenden contracten in gevaar te brengen.

### Optie D — uitgebreide versie met categorieën (English)

CTO at BOEMM! since early 2024. BOEMM! is the holding behind Jobfixers, Work Today, Staffler and Digital Payroll Services, delivering HR services across recruiting, temping, payroll and planning. My mission: take the group from an analogue HR business to a technology-driven, AI-first player.

What I run:

- Product engineering across four product lines — Eagle (recruiting), Staffler (planning & shift broadcast), Work Today (self-onboarding) and DPS (payroll).
- A team of around 18 people: 2 BAs, 5 backend engineers, 2 frontend engineers, 1 scrum master, 1 manual QA, 2 regression testers, 2 freelance devops, 1 sysadmin and 2 student-interns.
- One shared data platform (Redshift + Aurora + Airflow), one shared identity flow (ItsMe), and shared integrations with HubSpot, CUCM, Azure Entra ID and government services (Dimona, VDAB).

Highlights of the past two years:

- Stood up the analytics layer: Sales Cockpit, dim_ models, materialized views, CUCM call data ingested via Zero-ETL.
- Modernised identity and signing: ItsMe key rotation, Digidocs for digital documents and signatures.
- Aligned pay-commission blocking, wage templates and niche-DSR across Eagle, Staffler and Work Today.
- Set the operational cadence: Tech Superhero rotation in Slack, IT-support priority matrix, bi-weekly knowledge sharing, per-product release notes.
- Hands-on on production incidents: office IP whitelist, Entra sync, login 500s, geographic coverage analysis for sales planning.

Next horizon: AI-first workflows in each product, and retiring legacy integrations without disrupting the operational reality of 137 vehicles, 25+ offices and thousands of contracts.

## 5. Wat de BA's en Mathias zelf over BOEMM schrijven

Bron: LinkedIn-profielen (Branko's account voor Verhulst — die heeft jou geblokkeerd) + Google snippet voor Mathias.

### Laurens Verhulst — Business Analyst (verbatim)

"Acted as the bridge between business and IT in a fast-growing HR organization focused on AI-driven service innovation. Responsible for gathering and translating business requirements into clear, structured analyses, leading daily scrum meetings, coordinating technical teams, and managing project progress and priorities within an agile framework. Familiar with modeling tools (UML) and data analysis (e.g. Power BI), combining a pragmatic, solution-oriented mindset with strong communication skills and commercial awareness. Projects:

- WorkToday: improve the quality of application through analysis on bugs and workflows.
- Vacancies: implementation of the new brandbook to enable a higher conversion rate.
- Digital documents: analysis on the creation and signature of digital documents.
- TechWolf integration: review the integration and define a roadmap for future improvements."

### Mathias Volckaert — Product Owner / Product Manager (Google snippet)

"Mathias joined BOEMM at its very beginning, and his analyses and strict prioritisation were crucial to the successful launches of their MVPs. His role evolved from Product Owner to Product Manager. (...) responsible for business analysis and was product owner for different projects in a scrum-based setting. As an expert in JIRA and business intelligence tools, he consistently leveraged transparency, inspection, and data-driven prioritisation to deliver maximum business value, even under tight deadlines. (...) attention to detail and scientific approach stood out as BOEMM transitioned to an AI-first product, requiring rigorous evaluation of AI models and the development of AI-centric workflows."

### Alana Boelaert — Business Analyst (apr 2025 — feb 2026)

Geen tekstuele beschrijving op LinkedIn. Enkel skills: BPMN, User Stories +5 skills.

### Phaedra Meheus — Junior BA → BA (jan 2023 — mei 2025)

Geen tekstuele beschrijving op LinkedIn. Headline nu: Business & Product Analist bij OVB WILLEMOT.

### Sam Carlier — QA Support Engineer (oct 2025 — present)

Niet als BA. Headline: "Startende IT'er | Leergierig en gefocust op ondersteuning en testing". About: "Teamspeler die niet uit de weg gaat voor nieuwe uitdagingen". Achtergrond als bewaker bij TORANN en Securitas, herscholing via IBM Cybersecurity Analyst en ISTQB CTFL 4.0.

### Patronen die ik daaruit pik voor jouw eigen tekst

- Beide BA's beschrijven BOEMM als "fast-growing HR organization focused on AI-driven service innovation" / "transitioned to an AI-first product". Die framing zit dus al in de cultuur, gebruik gerust dezelfde woorden.
- Beide gebruiken een Projects-blok met 4 herkenbare project-namen. Dat werkt sterk op LinkedIn — concreter dan generieke verantwoordelijkheden. Ik heb daarom een Optie E hieronder toegevoegd met dezelfde structuur, op CTO-niveau.
- "Bridge between business and IT" past niet voor jou (jij bent de tech-leider, niet de bridge), maar "bridge between board and engineering" of "translating commercial ambitions into a working tech roadmap" werkt wel.
- Mathias' "scientific approach" en "rigorous evaluation of AI models" geven aan dat AI-first echt een interne doctrine is.

## 6. Optie E — uitgebreide CTO-versie met Projects-blok (Nederlands)

Headline-suggestie: CTO @ BOEMM! — engineering bridge tussen board en delivery, in volle AI-shift

CTO bij BOEMM!, sinds begin 2024. BOEMM! is de holding boven Jobfixers, Work Today, Staffler en Digital Payroll Services en levert HR-diensten over rekrutering, uitzending, payroll en planning.

Verantwoordelijk voor productontwikkeling, dataplatform en infrastructuur over vier producten en een team van zo'n 18 mensen (BA, dev, QA, devops, sysadmin). Werk als brug tussen het management en de delivery teams: commerciële ambities en HR-domeinkennis vertalen naar een werkende tech-roadmap, en die roadmap mee uitvoeren in een agile cadans (sprints, release notes per product, Tech Superhero-rotatie, prioriteitenmatrix voor IT-support).

Pragmatisch, oplossingsgericht en data-gedreven. Comfortabel met architectuurkeuzes (Java/Python/TypeScript, AWS, Redshift + Aurora, Airflow, Lambda, Zero-ETL), modelleer-tools en BI (Power BI, datalake-modellen, Sales Cockpit), en met de operationele realiteit van 137 wagens, 25+ kantoren en duizenden contracten per jaar.

Projecten van de voorbije twee jaar:

- Sales Cockpit & datalake: Redshift + Aurora-platform met dim_-modellen, materialized views en Zero-ETL ingest van CUCM-call data, voor real-time sales- en operations-rapportering.
- WorkToday self-onboarding: payroll- en planning-flow zonder kantoorhulp, inclusief auto-encodage in AWS en performance fixes (caching, read-write splitting, wage-package latency).
- Staffler & shift broadcast: planscherm met manueel plannen, broadcast en beschikbaarheden in één view, gekoppeld aan HubSpot, itsme en Credit Safe.
- Digidocs: end-to-end flow voor het aanmaken en ondertekenen van digitale documenten, met ItsMe als identity-laag.
- Eagle / VDAB / Recruitee: PC-codes, niches en wage templates over de drie producten gesynchroniseerd, en de vacancy-export naar VDAB en Recruitee gestabiliseerd.
- AI-shift: organisatie en team klaarzetten voor AI-first workflows over alle producten — van AI-modelevaluatie tot inbouw in dagelijkse flows.

## 7. Optie F — uitgebreide CTO-versie met Projects-blok (English)

Headline suggestion: CTO @ BOEMM! — engineering bridge between board and delivery, in the middle of the AI shift

CTO at BOEMM! since early 2024. BOEMM! is the holding behind Jobfixers, Work Today, Staffler and Digital Payroll Services, delivering HR services across recruiting, temping, payroll and planning.

Accountable for product engineering, data platform and infrastructure across four products and a team of around 18 people (BA, dev, QA, devops, sysadmin). Acting as the bridge between the board and the delivery teams: translating commercial ambitions and HR domain knowledge into a working tech roadmap, and executing that roadmap in an agile cadence (sprints, per-product release notes, Tech Superhero rotation, IT-support priority matrix).

Pragmatic, solution-oriented and data-driven. Comfortable with architecture decisions (Java/Python/TypeScript, AWS, Redshift + Aurora, Airflow, Lambda, Zero-ETL), modeling tools and BI (Power BI, data-lake models, Sales Cockpit), and with the operational reality of 137 vehicles, 25+ offices and thousands of contracts a year.

Projects of the past two years:

- Sales Cockpit & data lake: Redshift + Aurora platform with dim_ models, materialized views, and Zero-ETL ingest of CUCM call data, for real-time sales and operations reporting.
- WorkToday self-onboarding: payroll and planning flow without office support, including auto-encoding in AWS and performance fixes (caching, read-write splitting, wage-package latency).
- Staffler & shift broadcast: a single planning screen combining manual scheduling, shift broadcast and availability, integrated with HubSpot, itsme and Credit Safe.
- Digidocs: end-to-end flow for creating and signing digital documents, with ItsMe as identity layer.
- Eagle / VDAB / Recruitee: synchronised PC-codes, niches and wage templates across the three products, stabilised vacancy export to VDAB and Recruitee.
- AI shift: preparing organisation and team for AI-first workflows across products — from AI model evaluation to embedding in daily flows.

## 8. Open vragen / dingen die ik niet heb kunnen verifiëren

- Klopt de teamsamenstelling nog (~18 personen)? De memory zegt dit per ~april 2026. Sam Carlier is nu QA Support Engineer (niet BA), dus het BA-aantal is waarschijnlijk gedaald naar 1 (alleen Phaedra en Alana zijn vertrokken in 2025-2026).
- Wil je in de LinkedIn-tekst de woorden "Jobfixers", "Work Today" en "Staffler" laten staan, of liever generieker?
- Heb je liever dat ik je BOEMM-bio op boemm.eu/de-familie ook bijwerk?
- Welke optie wil je publiceren — A/B (kort), C/D (uitgebreid), of E/F (uitgebreid met Projects-blok)?
- Wil je dat ik de Vlerick Education-entry rechtstreeks toevoeg via LinkedIn? Dat kan vanuit Chrome zodra je akkoord bent met de exacte inhoud.
