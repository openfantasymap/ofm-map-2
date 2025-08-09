import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, ViewChild } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbar, MatToolbarModule, MatToolbarRow } from '@angular/material/toolbar';
import { OfmService } from '../ofm';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AsyncKeyword } from 'typescript';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatButton, MatButtonModule } from '@angular/material/button';
import { LocationUpgradeModule } from '@angular/common/upgrade';

@Component({
  selector: 'app-timelines',
  imports: [MatToolbarModule, MatIconModule, MatSidenavModule, MatChipsModule, MatListModule, MatGridListModule, RouterModule, CommonModule, MatButtonModule],
  templateUrl: './timelines.html',
  styleUrl: './timelines.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Timelines {

infoData: any;
events: any;

timelines!: any[];
seen_timelines!: any[];
tags: any;
selected_tags!: string[];

  constructor(
    private ofm: OfmService,
    private ht: HttpClient,
    private cdr: ChangeDetectorRef
  ) { 
  }

  @ViewChild('stgl', {read: ElementRef}) stgl!: ElementRef;

  disabled() {
    alert('Login disabled. User accounts and private maps will come soon');
  }

  ngOnInit(): void {
    this.ht.get('assets/info.json').subscribe((data:any) => {
      this.infoData = data;
      this.cdr.markForCheck();
    })
    this.ofm.getTimelines().subscribe((data:any) => {
      this.timelines = data;
      this.seen_timelines = data;
      this.cdr.markForCheck();
    })

    this.ofm.getTags().subscribe((data:any)=>{
      this.tags = data.map((x:any)=>{
        return {label:x, selected:true}
      });
      this.selected_tags = data;
    })

    
    setTimeout(()=>{
      this.stgl.nativeElement.click();
      setTimeout(()=>{
        this.stgl.nativeElement.click();
      },100);
    }, 100);
  }

  filter(ev:any, tag:string){
    console.log(tag);
    this.selected_tags = [tag];
    this.tags.map((x: any)=>x.selected=false);
    this.tags.filter((x:any)=>x.label===tag)[0].selected=true;
    this.seen_timelines = this.timelines.filter((x:any)=>x.tags?.indexOf(tag) >= 0);
  }

}
