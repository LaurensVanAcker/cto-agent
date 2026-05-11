// StafflerClient: een typed wrapper rond de Staffler / dps-service REST API.
//
// Auth: opaque skey in header `x-boemm-skey`. Skey kom je uit /publicapi/.../login
// en blijft geldig tot DynamoDB hem wist (Cognito refresh wordt server-side gedaan).
//
// LET OP: deze client maakt server-side calls. Niet rechtstreeks vanuit een browser
// gebruiken zolang de PoC origin niet in de Staffler `boemm.allowedOrigins` staat
// (zie ../../api/environments.md). De Express/Fastify proxy in ../server gebruikt
// deze client.

import type {
  AuthResultWebDto,
  CompanyUserLoginRequest,
  CompanyWebDto,
  ContractBaseWebDto,
  ContractWebDto,
  DpsUserDetailsWebDto,
  EmployeeWebDto,
  PageWebDto,
  ApiErrorResponse,
  DictionariesHolder,
  LanguageItem,
  StatuteItem,
} from "../types/staffler.js";

export type StafflerEnv = "dev" | "qa" | "prod";

export interface StafflerClientOptions {
  gateway: string;          // e.g. https://gw.qa.dps.boemm.eu
  skey?: string;            // optional pre-existing skey
  fetchImpl?: typeof fetch; // override for tests
  defaultTimeoutMs?: number;
}

export class StafflerError extends Error {
  constructor(
    public readonly status: number,
    public readonly kind: "gateway" | "business" | "transport",
    public readonly traceId: string | null,
    public readonly errors: ApiErrorResponse["apiErrors"] | null,
    public readonly raw: unknown
  ) {
    super(
      kind === "business" && errors?.length
        ? `Staffler business error: ${errors.map(e => e.code).join(", ")}`
        : `Staffler ${kind} error (HTTP ${status})`
    );
    this.name = "StafflerError";
  }
}

export class StafflerClient {
  private gateway: string;
  private skey: string | undefined;
  private fetchImpl: typeof fetch;
  private defaultTimeoutMs: number;

  constructor(opts: StafflerClientOptions) {
    this.gateway = opts.gateway.replace(/\/$/, "");
    this.skey = opts.skey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 12000;
  }

  setSkey(skey: string | undefined) {
    this.skey = skey;
  }

  getSkey() {
    return this.skey;
  }

  // -- auth --

  async login(req: CompanyUserLoginRequest): Promise<AuthResultWebDto> {
    const result = await this.publicCall<AuthResultWebDto>(
      "POST",
      "/publicapi/companies/users/login",
      req
    );
    if (result.authStatus === "SUCCESS" && result.skey) {
      this.skey = result.skey;
    }
    return result;
  }

  async setPassword(payload: {
    session: string;
    username: string;
    password: string;
  }): Promise<AuthResultWebDto> {
    const result = await this.publicCall<AuthResultWebDto>(
      "POST",
      "/publicapi/companies/users/setPassword",
      payload
    );
    if (result.authStatus === "SUCCESS" && result.skey) {
      this.skey = result.skey;
    }
    return result;
  }

  async logout(): Promise<void> {
    await this.authedCall<void>("GET", "/api/users/logout");
    this.skey = undefined;
  }

  // -- current user --

  async getCurrentUser(): Promise<DpsUserDetailsWebDto> {
    return this.authedCall<DpsUserDetailsWebDto>("GET", "/api/users/currentuser");
  }

  // -- companies --

  async getCompany(companyId: string): Promise<CompanyWebDto> {
    return this.authedCall<CompanyWebDto>("GET", `/api/companies/${companyId}`);
  }

  // -- engagement groups (= vestigingen in PoC terminology) --

  async listCompanyGroups(companyId: string): Promise<unknown[]> {
    return this.authedCall<unknown[]>("GET", `/api/companies/${companyId}/groups`);
  }

  // -- employees --

  async listEmployees(params: {
    companyId: string;
    nameLike?: string;
    page?: number;
    size?: number;
    sortBy?: string;
    groupIds?: string[];
  }): Promise<PageWebDto<EmployeeWebDto>> {
    const qs = this.buildQS({
      companyId: params.companyId,
      nameLike: params.nameLike,
      page: params.page ?? 0,
      size: params.size ?? 20,
      sortBy: params.sortBy ?? "lastName:asc",
      groupIds: params.groupIds?.join(","),
    });
    return this.authedCall<PageWebDto<EmployeeWebDto>>("GET", `/api/employees${qs}`);
  }

  async getEmployee(id: string): Promise<EmployeeWebDto> {
    return this.authedCall<EmployeeWebDto>("GET", `/api/employees/${id}`);
  }

  // -- contracts --

  async listContracts(params: {
    companyId: string;
    startDate: string; // yyyy-MM-dd
    endDate: string;
    employeeIds?: string[];
    statuses?: string[];
    page?: number;
    size?: number;
  }): Promise<PageWebDto<ContractBaseWebDto>> {
    const qs = this.buildQS({
      companyId: params.companyId,
      startDate: params.startDate,
      endDate: params.endDate,
      employeeIds: params.employeeIds?.join(","),
      statuses: params.statuses?.join(","),
      page: params.page ?? 0,
      size: params.size ?? 100,
    });
    return this.authedCall<PageWebDto<ContractBaseWebDto>>("GET", `/api/contracts${qs}`);
  }

  async getContract(id: string): Promise<ContractWebDto> {
    return this.authedCall<ContractWebDto>("GET", `/api/contracts/${id}`);
  }

  async createContract(contract: ContractWebDto): Promise<ContractWebDto> {
    return this.authedCall<ContractWebDto>("POST", "/api/contracts", contract);
  }

  async updateContract(id: string, contract: ContractWebDto): Promise<ContractWebDto> {
    return this.authedCall<ContractWebDto>("PUT", `/api/contracts/${id}`, contract);
  }

  // -- dictionary (publicapi, no auth needed) --

  async getDictionaries(types: string[]): Promise<DictionariesHolder> {
    const qs = "?types=" + encodeURIComponent(types.join(","));
    return this.publicCall<DictionariesHolder>("GET", `/publicapi/dictionaries${qs}`);
  }

  async getStatutes(pcCode?: string): Promise<StatuteItem[]> {
    const qs = pcCode ? `?pcCode=${encodeURIComponent(pcCode)}` : "";
    return this.publicCall<StatuteItem[]>("GET", `/publicapi/statutes${qs}`);
  }

  async getLanguages(onlyPrimary = false): Promise<LanguageItem[]> {
    const qs = onlyPrimary ? "?onlyPrimary=true" : "";
    return this.publicCall<LanguageItem[]>("GET", `/publicapi/languages${qs}`);
  }

  // -- raw helpers (escape hatches for endpoints not yet wrapped) --

  rawAuthed<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.authedCall<T>(method, path, body);
  }

  rawPublic<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.publicCall<T>(method, path, body);
  }

  // -- internals --

  private async authedCall<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.skey) {
      throw new StafflerError(0, "transport", null, null, "No skey set; call login() first.");
    }
    return this.call<T>(method, path, body, { "x-boemm-skey": this.skey });
  }

  private async publicCall<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.call<T>(method, path, body, {});
  }

  private async call<T>(
    method: string,
    path: string,
    body: unknown,
    extraHeaders: Record<string, string>
  ): Promise<T> {
    const url = `${this.gateway}/v1/dps-api${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.defaultTimeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new StafflerError(0, "transport", null, null, err);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        // body niet json
      }
      const apiErr = parsed as Partial<ApiErrorResponse> | undefined;
      if (apiErr?.apiErrors) {
        throw new StafflerError(
          res.status,
          "business",
          apiErr.traceId ?? null,
          apiErr.apiErrors,
          parsed
        );
      }
      throw new StafflerError(res.status, "gateway", null, null, parsed);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  private buildQS(params: Record<string, string | number | undefined | null>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? `?${parts.join("&")}` : "";
  }
}

export function gatewayFor(env: StafflerEnv): string {
  switch (env) {
    case "dev":
      return "https://gw.dev.dps.boemm.eu";
    case "qa":
      return "https://gw.qa.dps.boemm.eu";
    case "prod":
      return "https://gw.myplanning.digitalpayrollservices.be";
  }
}
