import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GaiaStorage {
  private http = inject(HttpClient);

  getPastQueries(world:string){
    let ret = [];
    let locals = localStorage.getItem("queries")
    if(locals){
      ret = JSON.parse(locals);
      ret = ret.filter((x:any)=>x.world === world)
      return ret;
    }
    else return [];
  }

  uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
  );
}

  addQuery(world: string, center:any, data: any, cone: any){
    console.log(cone);
    let ret = [];
    let locals = localStorage.getItem("queries")
    if(locals){
      ret = JSON.parse(locals);
    }

    ret.push({type:'Feature', world:world, properties: data, geometry:{type:'Point', coordinates: [center.lng, center.lat]}, id: this.uuidv4(), created: new Date().toISOString(), cone: cone});
    localStorage.setItem('queries', JSON.stringify(ret));
    return ret;
  }

  deleteQuery(id:string){

  }

  getMarkers(world:string){
    const ret =  {type:"FeatureCollection", features: this.getPastQueries(world)};
    console.log(ret);
    return ret;
  }
  getFovs(world:string){
    const ret =  {type:"FeatureCollection", features: this.getPastQueries(world).map((x:any)=>x.geometry = x.cone.geometry)};
    console.log(ret);
    return ret;
  }

  getAgents(world:string){
    return this.http.get('https://api.gaia.fantasymaps.org/'+world+'/agents/position')
  }
}
