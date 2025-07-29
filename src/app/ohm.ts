import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class OhmService {

  constructor(
    protected http: HttpClient
  ) { }

  getEvents(date: string, amount = 20): Observable<any> {
    return this.http.get('http://51.15.160.236:9034/events/' + date + '?limit=' + amount);
  }
  
  
  getStats(date: string, bbox:(number[]|null)=null, amount = 20, from=null, to=null): Observable<any> {
    if(bbox){
      return this.http.get('https://api.stats.openhistorymap.org/stats.json?bbox='+bbox.join(',')+'&date=' + date + '&limit=' + amount+'&from='+from+'&to='+to);
    } else {
      return of([]);
    }
  }

  drilldown(lnglat:{ lat: number; lng: number; } | { lat: number; lon: number; } | [number, number], radius=100, time='now'): Observable<any[]>{
    console.log('getting the elements around the selected point')
    return of([]);
  }

  su(url: string, image:(string|null) = null): Observable<string>{
    return this.http.post<string>('https://su.openhistorymap.org/?url='+url, image);
  }
}
