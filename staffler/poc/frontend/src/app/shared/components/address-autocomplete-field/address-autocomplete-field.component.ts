import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { TranslatePipe } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Subject, distinctUntilChanged, filter, map, startWith, tap } from 'rxjs';

import { OverlayOptions } from 'primeng/api';
import { AutoComplete, AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { InputTextModule } from 'primeng/inputtext';

import { FieldValidationErrorsComponent } from '../field-validation-errors/field-validation-errors.component';
import { AddressModel } from '@dps/shared/models';
import { AddressErrorNamesEnum } from '@dps/shared/validators';

const PLACE_DETAILS_FIELDS: string[] = [
  'address_components',
  'formatted_address',
  'geometry.location',
];
const STREET_NUMBER_PLACEHOLDER = '#';

@UntilDestroy()
@Component({
  selector: 'dps-address-autocomplete-field',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AutoCompleteModule,
    InputTextModule,
    TranslatePipe,
    FieldValidationErrorsComponent,
  ],
  templateUrl: './address-autocomplete-field.component.html',
  styleUrl: './address-autocomplete-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-column',
  },
  encapsulation: ViewEncapsulation.None,
})
export class AddressAutocompleteFieldComponent implements OnInit {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) control!: FormControl<AddressModel | null>;
  @Input() readonly!: boolean;

  @ViewChild('autocompleteInput') autocompleteInput!: AutoComplete;

  constructor(private readonly breakpointObserver: BreakpointObserver) {}

  private sessionToken = new google.maps.places.AutocompleteSessionToken();
  private readonly autocompleteService = new google.maps.places.AutocompleteService();
  private readonly placeService = new google.maps.places.PlacesService(
    document.createElement('div')
  );

  readonly minCharsToSearch = 3;
  readonly autocompleteControl = new FormControl<google.maps.places.AutocompletePrediction | null>(
    null
  );
  readonly busControl = new FormControl<string | null>(null);
  readonly searchSuggestions$ = new Subject<Array<google.maps.places.AutocompletePrediction>>();
  readonly addressErrorsEnum = AddressErrorNamesEnum;
  readonly isMobileScreen = this.breakpointObserver.isMatched(Breakpoints.XSmall);
  readonly suggestionOverlayOptions: OverlayOptions = {
    mode: this.isMobileScreen ? 'modal' : 'overlay',
  };

  ngOnInit(): void {
    this.control.valueChanges
      .pipe(startWith(this.control.value), untilDestroyed(this))
      .subscribe(address => {
        this.setAutocompleteFormattedAddress(address?.formattedAddress || null);
        this.busControl.setValue(address ? address.bus : null, { emitEvent: false });
      });

    this.control.statusChanges
      .pipe(
        startWith(this.control.status),
        map(status => status === 'DISABLED'),
        distinctUntilChanged(),
        untilDestroyed(this)
      )
      .subscribe(isDisabled => {
        if (isDisabled) {
          this.autocompleteControl.disable();
          this.busControl.disable();
          return;
        }

        this.autocompleteControl.enable();
        this.busControl.enable();
      });

    this.autocompleteControl.valueChanges
      .pipe(
        tap(() => {
          this.busControl.reset();
          this.control.markAsTouched();
        }),
        filter(Boolean),
        filter(selectedPlaceSuggestion => !!selectedPlaceSuggestion.place_id),
        untilDestroyed(this)
      )
      .subscribe(selectedPlaceSuggestion =>
        this.placeService.getDetails(
          {
            placeId: selectedPlaceSuggestion.place_id,
            sessionToken: this.sessionToken,
            fields: PLACE_DETAILS_FIELDS,
          },
          placeResult => this.handleSelectedPlace(selectedPlaceSuggestion, placeResult)
        )
      );

    this.busControl.valueChanges
      .pipe(
        filter(() => !!this.control.value),
        untilDestroyed(this)
      )
      .subscribe(postalBox =>
        this.control.setValue({ ...(this.control.getRawValue() as AddressModel), bus: postalBox })
      );
  }

  loadSuggestions(event: AutoCompleteCompleteEvent): void {
    this.autocompleteService.getPlacePredictions(
      {
        input: event.query,
        types: ['address'],
        sessionToken: this.sessionToken,
      },
      predictions => this.searchSuggestions$.next(predictions || [])
    );
  }

  private setAutocompleteFormattedAddress(address: string | null): void {
    this.autocompleteControl.setValue(
      address
        ? ({
            description: address,
          } as google.maps.places.AutocompletePrediction)
        : null,
      { emitEvent: false }
    );
  }

  private handleSelectedPlace(
    placeSuggestion: google.maps.places.AutocompletePrediction,
    placeResult: google.maps.places.PlaceResult | null
  ) {
    if (!placeResult) return;
    this.sessionToken = new google.maps.places.AutocompleteSessionToken();

    const { main_text, secondary_text } = placeSuggestion.structured_formatting;
    
    const parsedAddress = this.mapPlaceToAddress(
      placeResult, 
      this.busControl.value,
      main_text
    );
    
    this.control.setValue(parsedAddress);
    this.control.markAsDirty();

    if (parsedAddress.streetNumber) {
      this.setAutocompleteFormattedAddress(
        `${main_text}, ${secondary_text}`
      );
    } else {
      this.setAutocompleteFormattedAddress(
        `${main_text} ${STREET_NUMBER_PLACEHOLDER}, ${secondary_text}`
      );
      
      setTimeout(() => {
        const input = this.autocompleteInput.inputEL?.nativeElement as HTMLInputElement;
        const selectionStart = main_text.length + 1;
        input.setSelectionRange(
          selectionStart,
          selectionStart + STREET_NUMBER_PLACEHOLDER.length
        );
        input.focus();
      }, 500);
    }
  }

  private mapPlaceToAddress(
    { address_components, formatted_address, geometry }: google.maps.places.PlaceResult,
    bus: string | null,
    mainText?: string
  ): AddressModel {
    const countryComponent = address_components?.find(
      component => component.types[0] === 'country'
    );
    const locationComponent = geometry?.location;
    const streetComponent = address_components?.find(component =>
      component.types.includes('route')
    );
    const streetNumberComponent = address_components?.find(component =>
      component.types.includes('street_number')
    );
    const postalCodeComponent = address_components?.find(
      component => component.types[0] === 'postal_code'
    );
    const cityComponent = address_components?.find(component => 
      component.types[0] === 'locality'
    );

    let streetNumber = streetNumberComponent?.long_name || null;
    
    if (!streetNumber && mainText) {
      // Example: "Twee Molenstraat 3" -> "3"
      const matchEnd = mainText.match(/\s(\d+[\w\-]*)$/);
      if (matchEnd) {
        streetNumber = matchEnd[1];
      } else {
        // Example: "3 Twee Molenstraat" -> "3"
        const matchStart = mainText.match(/^(\d+[\w\-]*)\s/);
        if (matchStart) {
          streetNumber = matchStart[1];
        }
      }
    }

    let finalFormattedAddress = formatted_address as string;
    if (mainText && streetNumber) {
      const parts = [mainText];
      if (postalCodeComponent?.long_name) {
        parts.push(postalCodeComponent.long_name);
      }
      if (cityComponent?.long_name) {
        parts.push(cityComponent.long_name);
      }
      if (countryComponent?.long_name) {
        parts.push(countryComponent.long_name);
      }
      finalFormattedAddress = parts.join(', ');
    }

    return {
      street: streetComponent?.long_name as string,
      streetNumber,
      city: cityComponent?.long_name as string,
      postalCode: postalCodeComponent?.long_name as string,
      country: countryComponent?.long_name as string,
      countryCode: countryComponent?.short_name as string,
      latitude: locationComponent?.lat() as number,
      longitude: locationComponent?.lng() as number,
      formattedAddress: finalFormattedAddress,
      bus,
    };
  }
}
