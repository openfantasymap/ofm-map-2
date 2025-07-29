import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'nicedate'
})
export class NicedatePipe implements PipeTransform {

  transform(value: string|null, ...args: unknown[]): unknown {
    if (value) {
      return value.replace('AD', 'CE').replace('BC', 'BCE');
    } else {
      return '';
    }  }

}
