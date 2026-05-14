export interface AddressModel {
  street: string;
  streetNumber: string | null;
  city: string;
  postalCode: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
  bus: string | null;
}
