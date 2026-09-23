import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, concatMap, map } from 'rxjs/operators';
import { OhmService } from './ohm';

@Injectable({
  providedIn: 'root'
})
export class OfmService extends OhmService{

  constructor(
    http: HttpClient
  ) {
    super(http);
  }

  // env.json is generated at container start by docker-entrypoint.sh; in
  // dev the file ships from public/assets/. If it's missing or doesn't
  // parse for any reason, fall back to an empty config so the rest of the
  // chain (timelines / tags fetch) still fires. Otherwise the world picker
  // stays empty forever.
  private env(): Observable<any> {
    return this.http.get('/assets/env.json').pipe(
      catchError((err) => {
        console.warn('[ofm] env.json unavailable, continuing without TAG', err);
        return of({});
      }),
    );
  }

  getTimelines(){
    return this.env().pipe(
      concatMap((data:any)=>{
        var append = "";
        if (data && Object.keys(data).indexOf('TAG') >= 0){
          append = "?tag="+data.TAG;
        }
        return this.http.get('https://static.fantasymaps.org/timelines.json'+append);
      }));
  }


  getTags(){
    return this.env().pipe(
      concatMap((data:any)=>{
        var append = "";
        if (data && Object.keys(data).indexOf('TAG') >= 0){
          append = "?tag="+data.TAG;
        }
        return this.http.get('https://static.fantasymaps.org/tags.json'+append);
      }));
  }

  override getEvents(name: string, date: any, amount?: number): Observable<any> {
    return this.http.get('https://static.fantasymaps.org/'+name+'/events.json?around='+date+"&n="+amount)
  }
  s: any;

  getMap(name: string){
    return this.http.get('https://static.fantasymaps.org/'+name+'/map.json');
  }

  /**
   * Optional per-world guide (`/srv/ofm/<world>/WORLD.md`), served verbatim by
   * the staticfiles host. Emits the Markdown source, or null when the world
   * has none (404) or it can't be fetched.
   */
  getWorldGuide(name: string): Observable<string | null> {
    return this.http.get('https://staticfiles.fantasymaps.org/'+encodeURIComponent(name)+'/WORLD.md', { responseType: 'text' }).pipe(
      map(text => text?.trim() ? text : null),
      catchError(() => of(null)),
    );
  }
}
