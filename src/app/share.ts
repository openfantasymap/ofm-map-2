import { Directive, Input } from '@angular/core';

@Directive({
  selector: '[share]',
  standalone: true,
  host: {
    "(click)": "onClick($event)"
 }
})
export class ShareDirective {

  @Input('share') url = ''
  constructor() { }

  onClick(e:any){
    window.open(this.url, 'share', "width=400,height=300,toolbar=no,status=no,menubar=no");
  }


}
