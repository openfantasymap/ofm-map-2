import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-date',
  imports: [MatDialogModule],
  templateUrl: './date.html',
  styleUrl: './date.scss'
})
export class DateComponent implements OnInit {

  date!: Date;

  constructor(
    public dialogRef: MatDialogRef<DateComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Date
  ) { }

  ngOnInit(): void {
  }

}