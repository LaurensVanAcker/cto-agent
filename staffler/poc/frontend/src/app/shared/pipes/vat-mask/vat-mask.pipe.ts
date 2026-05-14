import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'vatMask',
  standalone: true,
})
export class VatMaskPipe implements PipeTransform {
  transform(vat: string): string {
    if (!vat) return '';

    const matched = vat.match(/^(\d{4})(\d{3})(\d{3})$/);
    if (matched) {
      return `${matched[1]}.${matched[2]}.${matched[3]}`;
    } else {
      return vat;
    }
  }
}
