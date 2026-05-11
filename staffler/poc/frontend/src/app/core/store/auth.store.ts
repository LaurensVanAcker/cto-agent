import { CurrentUserModel, UserRole } from '@dps/shared/models';
import { Store } from './store';
import { inject, Injectable } from '@angular/core';
import { filter } from 'rxjs';
import { Store as NgxsStore } from '@ngxs/store';
import { RootState } from './root/root.state';

interface AuthState {
  currentUser: CurrentUserModel | null;
}

@Injectable({ providedIn: 'root' })
export class AuthStore extends Store<AuthState> {
  #ngxsStore = inject(NgxsStore);

  readonly currCompany = this.#ngxsStore.selectSignal(RootState.getCompanyData);
  constructor() {
    super({ currentUser: null });
  }

  setCurrentUser(currentUser: CurrentUserModel): void {
    this.update({ currentUser });
  }

  getCurrUserData$() {
    return this.select$(state => state.currentUser).pipe(filter(Boolean));
  }

  hasRoles(desiredRoles: UserRole[]): boolean {
    const currentUser = this.get().currentUser;
    if (!currentUser) return false;

    const roles =
      currentUser.companyMemberships?.length > 0
        ? [
            currentUser.companyMemberships
              .find(m => m.companyId === this.currCompany()?.id)?.role
          ].filter(Boolean)
        : currentUser.userRoles ?? [];
    return desiredRoles.some(role => roles.includes(role));
  }
}
